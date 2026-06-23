GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_config TO authenticated, anon;
GRANT ALL ON public.app_config TO service_role;
NOTIFY pgrst, 'reload schema';