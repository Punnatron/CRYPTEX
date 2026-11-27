-- CRYPTEX: allow active ADMIN accounts to manage customer_profiles.
-- Run once in Supabase Dashboard > SQL Editor as the project owner.
-- This does NOT grant write access to anon or CUSTOMER/KYC_OFFICER/AML_ANALYST roles.

CREATE OR REPLACE FUNCTION public.is_active_cryptex_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.auth_user_id = auth.uid()
      AND upper(trim(u.role::text)) = 'ADMIN'
      AND upper(trim(u.account_status::text)) = 'ACTIVE'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_cryptex_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_cryptex_admin() TO authenticated;

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Column-level write privileges minimize what the browser client can change. RLS remains mandatory.
GRANT INSERT (customer_id, user_id, nationality, customer_status),
      UPDATE (nationality, customer_status),
      DELETE
ON TABLE public.customer_profiles TO authenticated;

DROP POLICY IF EXISTS cryptex_admin_insert_customer_profiles ON public.customer_profiles;
CREATE POLICY cryptex_admin_insert_customer_profiles
ON public.customer_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_active_cryptex_admin()
  AND EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.user_id = customer_profiles.user_id
      AND upper(trim(u.role::text)) = 'CUSTOMER'
      AND upper(trim(u.account_status::text)) = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS cryptex_admin_update_customer_profiles ON public.customer_profiles;
CREATE POLICY cryptex_admin_update_customer_profiles
ON public.customer_profiles
FOR UPDATE
TO authenticated
USING (public.is_active_cryptex_admin())
WITH CHECK (public.is_active_cryptex_admin());

DROP POLICY IF EXISTS cryptex_admin_delete_customer_profiles ON public.customer_profiles;
CREATE POLICY cryptex_admin_delete_customer_profiles
ON public.customer_profiles
FOR DELETE
TO authenticated
USING (public.is_active_cryptex_admin());
