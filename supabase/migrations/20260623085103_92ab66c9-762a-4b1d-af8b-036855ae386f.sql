GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_config TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.app_config TO service_role;
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst;