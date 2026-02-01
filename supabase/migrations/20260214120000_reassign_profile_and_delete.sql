CREATE OR REPLACE FUNCTION public.reassign_profile_and_delete(
    from_profile UUID,
    to_profile UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = to_profile
    ) THEN
        RAISE EXCEPTION 'Target admin profile not found: %', to_profile;
    END IF;

    UPDATE public.cars
    SET profile_id = to_profile
    WHERE profile_id = from_profile;

    DELETE FROM public.profiles
    WHERE id = from_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_profile_and_delete(UUID, UUID) TO authenticated;
