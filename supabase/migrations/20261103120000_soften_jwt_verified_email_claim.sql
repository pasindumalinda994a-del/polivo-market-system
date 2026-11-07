-- Clerk session tokens sometimes emit email_verified as a non-canonical string
-- (e.g. quote-wrapped) even when the user primary email is verified.
-- Require a non-empty JWT email; accept jsonb/text true forms; reject only
-- explicit false; allow ambiguous non-false strings when email is present
-- (web accept still gates on Clerk currentUser verification).

CREATE OR REPLACE FUNCTION public.polivo_jwt_verified_email()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_raw text;
  v_verified text;
  v_json jsonb;
BEGIN
  v_email := public.polivo_normalize_email(COALESCE(auth.jwt() ->> 'email', ''));
  IF v_email = '' THEN
    RAISE EXCEPTION 'EMAIL_NOT_VERIFIED' USING ERRCODE = 'P0001';
  END IF;

  v_json := auth.jwt() -> 'email_verified';
  IF v_json IS NULL THEN
    v_json := auth.jwt() -> 'emailVerified';
  END IF;

  IF v_json = 'true'::jsonb THEN
    RETURN v_email;
  END IF;
  IF v_json = 'false'::jsonb THEN
    RAISE EXCEPTION 'EMAIL_NOT_VERIFIED' USING ERRCODE = 'P0001';
  END IF;

  v_raw := COALESCE(auth.jwt() ->> 'email_verified', auth.jwt() ->> 'emailVerified', '');
  v_verified := lower(trim(both from v_raw));
  v_verified := trim(both '"' from v_verified);
  v_verified := trim(both '''' from v_verified);
  v_verified := trim(both from v_verified);

  IF v_verified IN ('true', 't', '1') THEN
    RETURN v_email;
  END IF;
  IF v_verified IN ('false', 'f', '0', '') THEN
    RAISE EXCEPTION 'EMAIL_NOT_VERIFIED' USING ERRCODE = 'P0001';
  END IF;

  -- Ambiguous non-false string with email present: allow (email-bound invite still applies).
  RETURN v_email;
END;
$$;

NOTIFY pgrst, 'reload schema';
