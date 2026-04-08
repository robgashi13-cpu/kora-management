
-- Fix privilege escalation: restrict profile updates to non-sensitive columns only
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile safely"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND is_admin = (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()));

-- Remove redundant anon SELECT on sales (anon ALL already covers it)
DROP POLICY IF EXISTS "Allow anon read sales" ON public.sales;
