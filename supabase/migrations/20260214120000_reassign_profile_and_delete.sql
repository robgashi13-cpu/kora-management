CREATE OR REPLACE FUNCTION public.reassign_profile_and_delete(from_profile TEXT, to_profile TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.sales
    SET
        seller_name = CASE WHEN seller_name = from_profile THEN to_profile ELSE seller_name END,
        sold_by = CASE WHEN sold_by = from_profile THEN to_profile ELSE sold_by END,
        attachments = CASE
            WHEN attachments IS NULL THEN attachments
            WHEN attachments->>'sellerName' = from_profile OR attachments->>'soldBy' = from_profile THEN
                jsonb_set(
                    jsonb_set(
                        attachments,
                        '{sellerName}',
                        to_jsonb(CASE WHEN attachments->>'sellerName' = from_profile THEN to_profile ELSE attachments->>'sellerName' END),
                        true
                    ),
                    '{soldBy}',
                    to_jsonb(CASE WHEN attachments->>'soldBy' = from_profile THEN to_profile ELSE attachments->>'soldBy' END),
                    true
                )
            ELSE attachments
        END
    WHERE
        seller_name = from_profile
        OR sold_by = from_profile
        OR attachments->>'sellerName' = from_profile
        OR attachments->>'soldBy' = from_profile;

    UPDATE public.sales
    SET attachments = jsonb_set(
        COALESCE(attachments, '{}'::jsonb),
        '{profiles}',
        COALESCE(
            (
                SELECT jsonb_agg(value)
                FROM jsonb_array_elements_text(COALESCE(attachments->'profiles', '[]'::jsonb)) AS value
                WHERE value <> from_profile
            ),
            '[]'::jsonb
        ),
        true
    )
    WHERE id = 'config_profile_avatars';
END;
$$;
