-- ============================================================================
-- CRYPTEX - Customer KYC Workflow (safe, repeatable migration)
-- Run once in Supabase Dashboard > SQL Editor using the project owner role.
-- Does not disable RLS and does not grant direct table INSERT/UPDATE/DELETE.
-- ============================================================================

-- 0) Guard against running against the wrong/incomplete schema.
DO $guard$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.customer_profiles') IS NULL
     OR to_regclass('public.kyc_verifications') IS NULL
     OR to_regclass('public.kyc_documents') IS NULL
     OR to_regclass('public.kyc_officers') IS NULL THEN
    RAISE EXCEPTION 'CRYPTEX KYC migration stopped: one or more required KYC tables are missing.';
  END IF;

  IF to_regprocedure('public.cryptex_has_role(text[])') IS NULL THEN
    RAISE EXCEPTION 'CRYPTEX KYC migration stopped: run the existing CRYPTEX RLS migration first (cryptex_has_role is missing).';
  END IF;
END
$guard$;

-- 1) submission_no is NOT NULL and currently has no default in the supplied schema.
-- Keep a monotonically increasing sequence and position it above existing demo rows.
CREATE SEQUENCE IF NOT EXISTS public.kyc_submission_no_seq;
ALTER TABLE public.kyc_verifications
  ALTER COLUMN submission_no SET DEFAULT nextval('public.kyc_submission_no_seq');
ALTER SEQUENCE public.kyc_submission_no_seq
  OWNED BY public.kyc_verifications.submission_no;

SELECT setval(
  'public.kyc_submission_no_seq',
  GREATEST(COALESCE((SELECT MAX(submission_no) FROM public.kyc_verifications), 0) + 1, 1),
  false
);

-- 2) Identity documents stay private. Only the account owner and KYC staff can read.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  8388608,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS cryptex_kyc_customer_upload ON storage.objects;
CREATE POLICY cryptex_kyc_customer_upload
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.cryptex_has_role(ARRAY['CUSTOMER'])
);

DROP POLICY IF EXISTS cryptex_kyc_document_read ON storage.objects;
CREATE POLICY cryptex_kyc_document_read
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.cryptex_has_role(ARRAY['ADMIN', 'KYC_OFFICER'])
  )
);

-- Allow the customer to remove an upload only from their own folder. The web app
-- uses this solely to clean up a file if the database submission fails.
DROP POLICY IF EXISTS cryptex_kyc_customer_delete_own_upload ON storage.objects;
CREATE POLICY cryptex_kyc_customer_delete_own_upload
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.cryptex_has_role(ARRAY['CUSTOMER'])
);

-- 3) CUSTOMER submission: profile + verification + document metadata are written
-- atomically inside one SECURITY DEFINER function. The caller's role and the
-- uploaded object's owner/path are explicitly checked before any DB changes.
CREATE OR REPLACE FUNCTION public.cryptex_submit_kyc(
  p_date_of_birth date,
  p_nationality text,
  p_occupation text,
  p_monthly_income numeric,
  p_document_type text,
  p_masked_document_number text,
  p_file_reference text,
  p_expiry_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid;
  v_customer_id uuid;
  v_kyc_id uuid;
  v_existing_status text;
BEGIN
  SELECT u.user_id
    INTO v_user_id
  FROM public.users AS u
  WHERE u.auth_user_id = auth.uid()
    AND upper(u.role) = 'CUSTOMER'
    AND upper(u.account_status) = 'ACTIVE';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Only active CUSTOMER accounts can submit KYC.';
  END IF;

  IF p_date_of_birth IS NULL OR p_date_of_birth >= CURRENT_DATE THEN
    RAISE EXCEPTION 'A valid date of birth in the past is required.';
  END IF;
  IF NULLIF(btrim(p_nationality), '') IS NULL THEN
    RAISE EXCEPTION 'Nationality is required.';
  END IF;
  IF p_monthly_income IS NOT NULL AND p_monthly_income < 0 THEN
    RAISE EXCEPTION 'Monthly income cannot be negative.';
  END IF;
  IF p_document_type NOT IN ('PASSPORT', 'NATIONAL_ID', 'DRIVING_LICENSE') THEN
    RAISE EXCEPTION 'Unsupported identity document type.';
  END IF;
  IF p_file_reference IS NULL
     OR split_part(p_file_reference, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Invalid identity document storage path.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS so
    WHERE so.bucket_id = 'kyc-documents'
      AND so.name = p_file_reference
  ) THEN
    RAISE EXCEPTION 'Identity document upload was not found in private storage.';
  END IF;

  INSERT INTO public.customer_profiles (
    user_id,
    date_of_birth,
    nationality,
    occupation,
    monthly_income,
    customer_status
  )
  VALUES (
    v_user_id,
    p_date_of_birth,
    btrim(p_nationality),
    NULLIF(btrim(p_occupation), ''),
    p_monthly_income,
    'PENDING'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    date_of_birth = EXCLUDED.date_of_birth,
    nationality = EXCLUDED.nationality,
    occupation = EXCLUDED.occupation,
    monthly_income = EXCLUDED.monthly_income,
    customer_status = 'PENDING'
  RETURNING customer_id INTO v_customer_id;

  SELECT kv.kyc_id, kv.verification_status
    INTO v_kyc_id, v_existing_status
  FROM public.kyc_verifications AS kv
  WHERE kv.customer_id = v_customer_id
  FOR UPDATE;

  IF v_existing_status = 'APPROVED' THEN
    RAISE EXCEPTION 'This KYC application is already approved.';
  END IF;

  IF v_kyc_id IS NULL THEN
    INSERT INTO public.kyc_verifications (
      customer_id,
      verification_level,
      verification_status,
      submitted_at
    )
    VALUES (
      v_customer_id,
      'STANDARD',
      'PENDING',
      now()
    )
    RETURNING kyc_id INTO v_kyc_id;
  ELSE
    UPDATE public.kyc_verifications
    SET submission_no = nextval('public.kyc_submission_no_seq'),
        verification_level = 'STANDARD',
        verification_status = 'PENDING',
        submitted_at = now(),
        reviewed_at = NULL,
        reviewer_id = NULL,
        rejection_reason = NULL
    WHERE kyc_id = v_kyc_id;
  END IF;

  INSERT INTO public.kyc_documents (
    kyc_id,
    document_type,
    masked_document_number,
    file_reference,
    document_status,
    expiry_date
  )
  VALUES (
    v_kyc_id,
    p_document_type,
    NULLIF(btrim(p_masked_document_number), ''),
    p_file_reference,
    'SUBMITTED',
    p_expiry_date
  );

  RETURN v_kyc_id;
END;
$function$;

-- 4) KYC_OFFICER review. MORE_INFO_REQUIRED is stored as PENDING plus an officer
-- note, avoiding introducing an unverified status value into an existing CHECK
-- constraint. The app then allows the customer to resubmit; the resubmission
-- clears the note and returns the application to the review queue.
CREATE OR REPLACE FUNCTION public.cryptex_review_kyc(
  p_kyc_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_officer_id uuid;
  v_customer_id uuid;
  v_target_status text;
BEGIN
  SELECT ko.officer_id
    INTO v_officer_id
  FROM public.users AS u
  JOIN public.kyc_officers AS ko
    ON ko.officer_id = u.user_id
  WHERE u.auth_user_id = auth.uid()
    AND upper(u.role) = 'KYC_OFFICER'
    AND upper(u.account_status) = 'ACTIVE'
    AND upper(ko.officer_status) = 'ACTIVE';

  IF v_officer_id IS NULL THEN
    RAISE EXCEPTION 'An active KYC_OFFICER profile is required.';
  END IF;

  IF p_decision NOT IN ('APPROVED', 'REJECTED', 'MORE_INFO_REQUIRED') THEN
    RAISE EXCEPTION 'Invalid KYC decision.';
  END IF;
  IF p_decision IN ('REJECTED', 'MORE_INFO_REQUIRED')
     AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required for this decision.';
  END IF;

  v_target_status := CASE
    WHEN p_decision = 'MORE_INFO_REQUIRED' THEN 'PENDING'
    ELSE p_decision
  END;

  UPDATE public.kyc_verifications AS kv
  SET verification_status = v_target_status,
      reviewed_at = now(),
      reviewer_id = v_officer_id,
      rejection_reason = CASE
        WHEN p_decision = 'APPROVED' THEN NULL
        ELSE NULLIF(btrim(p_reason), '')
      END
  WHERE kv.kyc_id = p_kyc_id
    AND kv.verification_status = 'PENDING'
    AND kv.rejection_reason IS NULL
  RETURNING kv.customer_id INTO v_customer_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'KYC application not found or already reviewed.';
  END IF;

  UPDATE public.customer_profiles AS cp
  SET customer_status = CASE
    WHEN p_decision = 'APPROVED' THEN 'VERIFIED'
    ELSE 'PENDING'
  END
  WHERE cp.customer_id = v_customer_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cryptex_submit_kyc(date, text, text, numeric, text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cryptex_review_kyc(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cryptex_submit_kyc(date, text, text, numeric, text, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cryptex_review_kyc(uuid, text, text) TO authenticated;

-- Verification output: confirm bucket and RPCs exist after execution.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'kyc-documents';

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('cryptex_submit_kyc', 'cryptex_review_kyc')
ORDER BY routine_name;
