-- ============================================================================
-- CRYPTEX FINAL KYC POLICY + EXCHANGE ACCESS GATE
-- Run once in Supabase SQL Editor AFTER the existing KYC workflow migrations.
-- This does not change existing table grants or disable RLS.
-- ============================================================================

DO $guard$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.customer_profiles') IS NULL
     OR to_regclass('public.kyc_verifications') IS NULL THEN
    RAISE EXCEPTION 'Required CRYPTEX KYC tables are missing.';
  END IF;
  IF to_regprocedure('public.cryptex_has_role(text[])') IS NULL THEN
    RAISE EXCEPTION 'Required function public.cryptex_has_role(text[]) is missing. Run the CRYPTEX RLS migration first.';
  END IF;
END
$guard$;

-- A SECURITY DEFINER helper avoids recursive RLS evaluation while checking
-- whether the authenticated customer has an approved KYC verification.
CREATE OR REPLACE FUNCTION public.cryptex_customer_kyc_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.customer_profiles cp ON cp.user_id = u.user_id
    JOIN public.kyc_verifications kv ON kv.customer_id = cp.customer_id
    WHERE u.auth_user_id = auth.uid()
      AND upper(u.role) = 'CUSTOMER'
      AND upper(u.account_status) = 'ACTIVE'
      AND upper(kv.verification_status) = 'APPROVED'
  );
$function$;

REVOKE ALL ON FUNCTION public.cryptex_customer_kyc_approved() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cryptex_customer_kyc_approved() TO authenticated;

-- Restrictive policies are combined with existing permissive ownership/role
-- policies using AND. Staff roles are unaffected; customers must be KYC-approved.
DO $policies$
DECLARE
  t text;
  tables_to_guard text[] := ARRAY[
    'accounts',
    'account_asset_balances',
    'blockchain_addresses',
    'transactions',
    'blockchain_transfers',
    'trade_orders',
    'trade_executions'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_guard LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS cryptex_exchange_requires_approved_kyc ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY cryptex_exchange_requires_approved_kyc ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.cryptex_has_role(ARRAY[''ADMIN'', ''KYC_OFFICER'', ''AML_ANALYST'']) OR (public.cryptex_has_role(ARRAY[''CUSTOMER'']) AND public.cryptex_customer_kyc_approved())) WITH CHECK (public.cryptex_has_role(ARRAY[''ADMIN'', ''KYC_OFFICER'', ''AML_ANALYST'']) OR (public.cryptex_has_role(ARRAY[''CUSTOMER'']) AND public.cryptex_customer_kyc_approved()))',
        t
      );
    END IF;
  END LOOP;
END
$policies$;

-- Verify which protected tables received the policy.
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname = 'cryptex_exchange_requires_approved_kyc'
ORDER BY tablename;
