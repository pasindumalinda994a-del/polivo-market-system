-- Fix polivo_new_id for SECURITY DEFINER functions with search_path = ''.
-- On hosted Supabase, gen_random_uuid() often lives in extensions, not resolvable
-- with an empty search_path, which made create_stall_with_owner fail at runtime.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.polivo_new_id(p_prefix text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  RETURN p_prefix || replace(extensions.gen_random_uuid()::text, '-', '');
END;
$$;
