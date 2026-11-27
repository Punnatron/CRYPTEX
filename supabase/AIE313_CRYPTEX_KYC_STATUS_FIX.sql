-- ============================================================================
-- CRYPTEX - KYC review/document status alignment
-- Run this migration AFTER AIE313_CRYPTEX_KYC_WORKFLOW.sql has been installed.
-- It does not disable RLS or grant browser-side table write privileges.
-- ============================================================================

DO $guard$
BEGIN
  IF to_regclass('public.kyc_verifications') IS NULL
     OR to_regclass('public.kyc_documents') IS NULL
     OR to_regclass('public.customer_profiles') IS NULL
     OR to_regclass('public.users') IS NULL
     OR to_regclass('public.kyc_officers') IS NULL THEN
    RAISE EXCEPTION 'KYC status fix stopped: one or more required CRYPTEX tables are missing.';
  END IF;
END
$guard$;

-- Pick a document status that is compatible with existing CHECK constraints.
-- Prefer VERIFIED for approval, but use APPROVED/ACCEPTED/PASSED if the schema
-- already restricts document_status to one of those labels. Rejections prefer
-- REJECTED, then DECLINED/INVALID. The helper is callable only by its owner and
-- is invoked from the SECURITY DEFINER review RPC below.
CREATE OR REPLACE FUNCTION public.cryptex_set_kyc_document_status(
  p_kyc_id uuid,
  p_status_kind text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_candidates text[];
  v_allowed text[];
  v_candidate text;
  v_rows integer;
BEGIN
  IF p_status_kind = 'APPROVED' THEN
    v_candidates := ARRAY['VERIFIED', 'APPROVED', 'ACCEPTED', 'PASSED'];
  ELSIF p_status_kind = 'REJECTED' THEN
    v_candidates := ARRAY['REJECTED', 'DECLINED', 'INVALID'];
  ELSE
    RAISE EXCEPTION 'Unsupported document status operation: %', p_status_kind;
  END IF;

  SELECT array_agg(DISTINCT lower(m.captures[1]))
    INTO v_allowed
  FROM pg_catalog.pg_constraint AS c
  CROSS JOIN LATERAL pg_catalog.regexp_matches(
    pg_catalog.pg_get_constraintdef(c.oid),
    '''([^'']+)''',
    'g'
  ) AS m(captures)
  WHERE c.conrelid = 'public.kyc_documents'::regclass
    AND c.contype = 'c'
    AND pg_catalog.pg_get_constraintdef(c.oid) ILIKE '%document_status%';

  FOREACH v_candidate IN ARRAY v_candidates LOOP
    -- If a CHECK constraint explicitly lists allowed values, skip candidates
    -- not in that list. If there are no literal values to inspect, try/catch
    -- the update itself so any other CHECK constraint remains authoritative.
    IF coalesce(array_length(v_allowed, 1), 0) > 0
       AND lower(v_candidate) <> ALL (v_allowed) THEN
      CONTINUE;
    END IF;

    BEGIN
      UPDATE public.kyc_documents
      SET document_status = v_candidate
      WHERE kyc_id = p_kyc_id
        AND document_status = 'SUBMITTED';
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows > 0 THEN
        RETURN v_candidate;
      END IF;
    EXCEPTION WHEN check_violation THEN
      -- Try the next compatible label; the failed UPDATE is rolled back.
      NULL;
    END;
  END LOOP;

  RAISE EXCEPTION
    'Could not set a compatible document_status for KYC %. Check the document_status CHECK constraint values.',
    p_kyc_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cryptex_set_kyc_document_status(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- Update the existing review RPC. Request-more-information remains stored as
-- PENDING + rejection_reason (to avoid changing the existing status constraint).
-- The UI derives MORE_INFO_REQUIRED from that combination and enables resubmission.
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

  IF p_decision IS NULL OR p_decision NOT IN ('APPROVED', 'REJECTED', 'MORE_INFO_REQUIRED') THEN
    RAISE EXCEPTION 'Invalid KYC decision.';
  END IF;

  IF p_decision IN ('REJECTED', 'MORE_INFO_REQUIRED')
     AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required for this decision.';
  END IF;

  UPDATE public.kyc_verifications AS kv
  SET verification_status = CASE
        WHEN p_decision = 'MORE_INFO_REQUIRED' THEN 'PENDING'
        ELSE p_decision
      END,
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

  -- Align document and application states. A request for more information does
  -- not reject the current file; it remains SUBMITTED until customer resubmits.
  IF p_decision IN ('APPROVED', 'REJECTED') THEN
    PERFORM public.cryptex_set_kyc_document_status(p_kyc_id, p_decision);
  END IF;

  UPDATE public.customer_profiles AS cp
  SET customer_status = CASE
        WHEN p_decision = 'APPROVED' THEN 'VERIFIED'
        ELSE 'PENDING'
      END
  WHERE cp.customer_id = v_customer_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cryptex_review_kyc(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cryptex_review_kyc(uuid, text, text)
  TO authenticated;

-- Backfill already-reviewed demo/customer records, including zabit's approved
-- submission, so older documents no longer remain SUBMITTED after a decision.
DO $backfill$
DECLARE
  v_record record;
BEGIN
  FOR v_record IN
    SELECT DISTINCT kv.kyc_id, kv.verification_status
    FROM public.kyc_verifications AS kv
    WHERE kv.verification_status IN ('APPROVED', 'REJECTED')
      AND EXISTS (
        SELECT 1
        FROM public.kyc_documents AS d
        WHERE d.kyc_id = kv.kyc_id
          AND d.document_status = 'SUBMITTED'
      )
  LOOP
    BEGIN
      PERFORM public.cryptex_set_kyc_document_status(
        v_record.kyc_id,
        v_record.verification_status
      );
    EXCEPTION WHEN OTHERS THEN
      -- Preserve migration installation if historical CHECK constraints use
      -- custom labels; report the affected KYC ID for follow-up inspection.
      RAISE NOTICE 'Could not backfill KYC % (%): %',
        v_record.kyc_id, v_record.verification_status, SQLERRM;
    END;
  END LOOP;
END
$backfill$;

-- Verification: review statuses alongside their document statuses.
SELECT
  kv.submission_no,
  kv.verification_status,
  kv.rejection_reason,
  d.document_type,
  d.document_status,
  count(*) OVER (PARTITION BY kv.kyc_id) AS documents_for_application
FROM public.kyc_verifications AS kv
LEFT JOIN public.kyc_documents AS d ON d.kyc_id = kv.kyc_id
ORDER BY kv.submitted_at DESC, d.uploaded_at DESC
LIMIT 50;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('cryptex_review_kyc', 'cryptex_set_kyc_document_status')
ORDER BY routine_name;
