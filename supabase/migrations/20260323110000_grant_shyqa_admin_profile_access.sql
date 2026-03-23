-- Grant Shyqa the same elevated access gate used by RBAC policies.
CREATE OR REPLACE FUNCTION public.is_admin_robert()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_profile_name() IN ('Robert', 'Shyqa');
$$;
