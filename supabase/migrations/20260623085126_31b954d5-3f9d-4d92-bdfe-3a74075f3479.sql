COMMENT ON TABLE public.app_config IS 'Application configuration key-value store';
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';