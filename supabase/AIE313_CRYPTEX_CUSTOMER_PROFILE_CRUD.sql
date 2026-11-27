-- ============================================================================
-- CRYPTEX | Customer Profile CRUD for ADMIN
-- Run ONCE in Supabase Dashboard > SQL Editor as project owner.
--
-- Scope:
--   CREATE  - create a customer_profiles row for an existing ACTIVE CUSTOMER
--             Auth/public.users account that does not yet have a profile.
--   READ    - list profiles and eligible registered users.
--   UPDATE  - edit date of birth, nationality, occupation and monthly income.
--   DELETE  - delete only a profile with NO KYC, risk, account, address or AML
--             history. Existing business history is intentionally protected.
--
-- No new table is created. No direct browser-side table write grants are added.
-- All operations are exposed through SECURITY DEFINER RPCs with an ADMIN check.
-- ============================================================================

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.customer_profiles') IS NULL
     OR to_regclass('public.audit_logs') IS NULL
     OR to_regclass('public.accounts') IS NULL
     OR to_regclass('public.kyc_verifications') IS NULL
     OR to_regclass('public.customer_risk_assessments') IS NULL
     OR to_regclass('public.blockchain_addresses') IS NULL
     OR to_regclass('public.aml_alerts') IS NULL THEN
    RAISE EXCEPTION 'CRYPTEX CRUD migration stopped: one or more required tables are missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'auth_user_id'
  ) THEN
    RAISE EXCEPTION 'CRYPTEX CRUD migration stopped: public.users.auth_user_id is missing.';
  END IF;
END
$guard$;

-- Centralized helper: only an ACTIVE ADMIN linked to the current Auth session.
CREATE OR REPLACE FUNCTION public.cryptex_is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.auth_user_id = auth.uid()
      AND upper(trim(u.role::text)) = 'ADMIN'
      AND upper(trim(u.account_status::text)) = 'ACTIVE'
  );
$function$;

REVOKE ALL ON FUNCTION public.cryptex_is_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cryptex_is_active_admin() TO authenticated;

-- READ: all customer profiles plus a safe flag indicating whether the profile
-- has related business history and therefore cannot be physically deleted.
CREATE OR REPLACE FUNCTION public.cryptex_admin_list_customer_profiles()
RETURNS TABLE (
  customer_id uuid,
  user_id uuid,
  full_name text,
  email text,
  date_of_birth date,
  nationality text,
  occupation text,
  monthly_income numeric,
  customer_status text,
  created_at timestamptz,
  has_related_records boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public.cryptex_is_active_admin() THEN
    RAISE EXCEPTION 'Only an active ADMIN can view customer management data.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cp.customer_id,
    cp.user_id,
    u.full_name::text,
    u.email::text,
    cp.date_of_birth,
    cp.nationality::text,
    cp.occupation::text,
    cp.monthly_income,
    cp.customer_status::text,
    cp.created_at,
    (
      EXISTS (SELECT 1 FROM public.accounts a WHERE a.customer_id = cp.customer_id)
      OR EXISTS (SELECT 1 FROM public.kyc_verifications kv WHERE kv.customer_id = cp.customer_id)
      OR EXISTS (SELECT 1 FROM public.customer_risk_assessments cra WHERE cra.customer_id = cp.customer_id)
      OR EXISTS (SELECT 1 FROM public.blockchain_addresses ba WHERE ba.customer_id = cp.customer_id)
      OR EXISTS (SELECT 1 FROM public.aml_alerts al WHERE al.customer_id = cp.customer_id)
    ) AS has_related_records
  FROM public.customer_profiles AS cp
  INNER JOIN public.users AS u ON u.user_id = cp.user_id
  ORDER BY cp.created_at DESC, u.full_name ASC;
END;
$function$;

-- READ: only Auth-linked active CUSTOMER accounts without a customer profile.
CREATE OR REPLACE FUNCTION public.cryptex_admin_list_unlinked_customer_users()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public.cryptex_is_active_admin() THEN
    RAISE EXCEPTION 'Only an active ADMIN can view eligible customer accounts.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.user_id, u.full_name::text, u.email::text
  FROM public.users AS u
  WHERE upper(trim(u.role::text)) = 'CUSTOMER'
    AND upper(trim(u.account_status::text)) = 'ACTIVE'
    AND u.auth_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_profiles AS cp
      WHERE cp.user_id = u.user_id
    )
  ORDER BY u.created_at DESC, u.full_name ASC;
END;
$function$;

-- CREATE: create a profile for an existing Auth-linked ACTIVE CUSTOMER account.
CREATE OR REPLACE FUNCTION public.cryptex_admin_create_customer_profile(
  p_user_id uuid,
  p_date_of_birth date,
  p_nationality text,
  p_occupation text DEFAULT NULL,
  p_monthly_income numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_admin_user_id uuid;
  v_customer_id uuid;
BEGIN
  IF NOT public.cryptex_is_active_admin() THEN
    RAISE EXCEPTION 'Only an active ADMIN can create customer profiles.'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id INTO v_admin_user_id
  FROM public.users AS u
  WHERE u.auth_user_id = auth.uid()
    AND upper(trim(u.role::text)) = 'ADMIN'
    AND upper(trim(u.account_status::text)) = 'ACTIVE';

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Select a registered customer account.';
  END IF;
  IF p_date_of_birth IS NULL OR p_date_of_birth >= CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth must be a valid date in the past.';
  END IF;
  IF NULLIF(trim(p_nationality), '') IS NULL THEN
    RAISE EXCEPTION 'Nationality is required.';
  END IF;
  IF p_monthly_income IS NOT NULL AND p_monthly_income < 0 THEN
    RAISE EXCEPTION 'Monthly income cannot be negative.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.user_id = p_user_id
      AND upper(trim(u.role::text)) = 'CUSTOMER'
      AND upper(trim(u.account_status::text)) = 'ACTIVE'
      AND u.auth_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The selected account must be an ACTIVE CUSTOMER.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_profiles AS cp WHERE cp.user_id = p_user_id) THEN
    RAISE EXCEPTION 'This customer account already has a profile.';
  END IF;

  INSERT INTO public.customer_profiles (
    user_id, date_of_birth, nationality, occupation, monthly_income, customer_status
  ) VALUES (
    p_user_id,
    p_date_of_birth,
    trim(p_nationality),
    NULLIF(trim(p_occupation), ''),
    p_monthly_income,
    'PENDING'
  )
  RETURNING customer_id INTO v_customer_id;

  INSERT INTO public.audit_logs (
    actor_user_id, action, entity_name, entity_id,
    old_values, new_values, action_note, created_at
  ) VALUES (
    v_admin_user_id, 'CREATE', 'customer_profiles', v_customer_id,
    NULL,
    jsonb_build_object(
      'user_id', p_user_id,
      'created_fields', ARRAY['date_of_birth', 'nationality', 'occupation', 'monthly_income'],
      'customer_status', 'PENDING'
    ),
    'Customer profile created by ADMIN through CRYPTEX Customer Management.',
    now()
  );

  RETURN v_customer_id;
END;
$function$;

-- UPDATE: edit profile attributes. customer_status remains controlled by KYC.
CREATE OR REPLACE FUNCTION public.cryptex_admin_update_customer_profile(
  p_customer_id uuid,
  p_date_of_birth date,
  p_nationality text,
  p_occupation text DEFAULT NULL,
  p_monthly_income numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_admin_user_id uuid;
  v_old_values jsonb;
  v_new_values jsonb;
BEGIN
  IF NOT public.cryptex_is_active_admin() THEN
    RAISE EXCEPTION 'Only an active ADMIN can update customer profiles.'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id INTO v_admin_user_id
  FROM public.users AS u
  WHERE u.auth_user_id = auth.uid()
    AND upper(trim(u.role::text)) = 'ADMIN'
    AND upper(trim(u.account_status::text)) = 'ACTIVE';

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile ID is required.';
  END IF;
  IF p_date_of_birth IS NULL OR p_date_of_birth >= CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth must be a valid date in the past.';
  END IF;
  IF NULLIF(trim(p_nationality), '') IS NULL THEN
    RAISE EXCEPTION 'Nationality is required.';
  END IF;
  IF p_monthly_income IS NOT NULL AND p_monthly_income < 0 THEN
    RAISE EXCEPTION 'Monthly income cannot be negative.';
  END IF;

  PERFORM 1
  FROM public.customer_profiles AS cp
  WHERE cp.customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile was not found.';
  END IF;

  v_old_values := jsonb_build_object(
    'changed_fields', ARRAY['date_of_birth', 'nationality', 'occupation', 'monthly_income']
  );

  UPDATE public.customer_profiles AS cp
  SET date_of_birth = p_date_of_birth,
      nationality = trim(p_nationality),
      occupation = NULLIF(trim(p_occupation), ''),
      monthly_income = p_monthly_income
  WHERE cp.customer_id = p_customer_id
  RETURNING jsonb_build_object(
    'changed_fields', ARRAY['date_of_birth', 'nationality', 'occupation', 'monthly_income']
  ) INTO v_new_values;

  INSERT INTO public.audit_logs (
    actor_user_id, action, entity_name, entity_id,
    old_values, new_values, action_note, created_at
  ) VALUES (
    v_admin_user_id, 'UPDATE', 'customer_profiles', p_customer_id,
    v_old_values, v_new_values,
    'Customer profile updated by ADMIN through CRYPTEX Customer Management.',
    now()
  );
END;
$function$;

-- DELETE: protect a profile once KYC/AML/exchange history is attached to it.
CREATE OR REPLACE FUNCTION public.cryptex_admin_delete_customer_profile(
  p_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_admin_user_id uuid;
  v_old_values jsonb;
  v_profile_user_id uuid;
BEGIN
  IF NOT public.cryptex_is_active_admin() THEN
    RAISE EXCEPTION 'Only an active ADMIN can delete customer profiles.'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id INTO v_admin_user_id
  FROM public.users AS u
  WHERE u.auth_user_id = auth.uid()
    AND upper(trim(u.role::text)) = 'ADMIN'
    AND upper(trim(u.account_status::text)) = 'ACTIVE';

  SELECT cp.user_id INTO v_profile_user_id
  FROM public.customer_profiles AS cp
  WHERE cp.customer_id = p_customer_id
  FOR UPDATE;

  IF v_profile_user_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile was not found.';
  END IF;

  v_old_values := jsonb_build_object(
    'user_id', v_profile_user_id,
    'deleted', true
  );

  IF EXISTS (SELECT 1 FROM public.accounts a WHERE a.customer_id = p_customer_id)
     OR EXISTS (SELECT 1 FROM public.kyc_verifications kv WHERE kv.customer_id = p_customer_id)
     OR EXISTS (SELECT 1 FROM public.customer_risk_assessments cra WHERE cra.customer_id = p_customer_id)
     OR EXISTS (SELECT 1 FROM public.blockchain_addresses ba WHERE ba.customer_id = p_customer_id)
     OR EXISTS (SELECT 1 FROM public.aml_alerts al WHERE al.customer_id = p_customer_id) THEN
    RAISE EXCEPTION 'This profile has KYC, risk, AML or exchange history and cannot be deleted. Keep the record to preserve data relationships.';
  END IF;

  DELETE FROM public.customer_profiles AS cp
  WHERE cp.customer_id = p_customer_id;

  INSERT INTO public.audit_logs (
    actor_user_id, action, entity_name, entity_id,
    old_values, new_values, action_note, created_at
  ) VALUES (
    v_admin_user_id, 'DELETE', 'customer_profiles', p_customer_id,
    v_old_values, NULL,
    'Customer profile deleted by ADMIN through CRYPTEX Customer Management.',
    now()
  );
END;
$function$;

-- Remove any default PUBLIC/anon execution and grant only to signed-in users.
REVOKE ALL ON FUNCTION public.cryptex_admin_list_customer_profiles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cryptex_admin_list_unlinked_customer_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cryptex_admin_create_customer_profile(uuid, date, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cryptex_admin_update_customer_profile(uuid, date, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cryptex_admin_delete_customer_profile(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cryptex_admin_list_customer_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cryptex_admin_list_unlinked_customer_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cryptex_admin_create_customer_profile(uuid, date, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cryptex_admin_update_customer_profile(uuid, date, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cryptex_admin_delete_customer_profile(uuid) TO authenticated;

COMMIT;

-- Post-install verification: these five RPCs should be listed.
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'cryptex_admin_list_customer_profiles',
    'cryptex_admin_list_unlinked_customer_users',
    'cryptex_admin_create_customer_profile',
    'cryptex_admin_update_customer_profile',
    'cryptex_admin_delete_customer_profile',
    'cryptex_is_active_admin'
  )
ORDER BY routine_name;
