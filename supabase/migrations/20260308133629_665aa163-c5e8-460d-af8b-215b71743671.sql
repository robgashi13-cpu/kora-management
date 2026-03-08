-- Fix sales RLS: drop restrictive, create permissive
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.sales;
CREATE POLICY "Allow all for authenticated" ON public.sales
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read sales" ON public.sales
    FOR SELECT TO anon USING (true);

-- Fix app_config RLS: drop restrictive, create permissive
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.app_config;
CREATE POLICY "Allow all for authenticated" ON public.app_config
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all app_config" ON public.app_config
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- Fix bank_transactions RLS
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.bank_transactions;
CREATE POLICY "Allow all for authenticated" ON public.bank_transactions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix profiles: allow anon to read
DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;
CREATE POLICY "Allow anon read profiles" ON public.profiles
    FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated read profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true)