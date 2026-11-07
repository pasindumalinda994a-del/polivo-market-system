-- Phase 15: short-lived single-use local staff first-owner setup grants.
-- Distinct from device_enrollment_grants. Empty local staff tables must not self-claim ownership.

CREATE TABLE public.local_staff_setup_grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  secret_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('issued', 'consumed', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  authorizing_owner_subject text NOT NULL,
  owner_membership_id text NOT NULL REFERENCES public.tenant_memberships (id) ON DELETE RESTRICT,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (secret_digest)
);

CREATE INDEX local_staff_setup_grants_tenant_status_idx
  ON public.local_staff_setup_grants (tenant_id, status);

ALTER TABLE public.local_staff_setup_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_staff_setup_grants FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.local_staff_setup_grants FROM PUBLIC, anon, authenticated;

CREATE POLICY local_staff_setup_grants_no_direct_access
  ON public.local_staff_setup_grants
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.authorize_local_staff_setup_grant(
  p_tenant_id text,
  p_secret_digest text,
  p_ttl_seconds integer DEFAULT 900
)
RETURNS TABLE (
  grant_id text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_membership_id text;
  v_grant_id text;
  v_expires timestamptz;
  v_ttl integer;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_secret_digest IS NULL OR char_length(trim(p_secret_digest)) < 32 THEN
    RAISE EXCEPTION 'INVALID_SECRET_DIGEST' USING ERRCODE = 'P0001';
  END IF;

  v_ttl := COALESCE(p_ttl_seconds, 900);
  IF v_ttl < 60 OR v_ttl > 3600 THEN
    RAISE EXCEPTION 'INVALID_TTL' USING ERRCODE = 'P0001';
  END IF;

  SELECT m.id INTO v_membership_id
  FROM public.tenant_memberships m
  WHERE m.tenant_id = p_tenant_id
    AND m.identity_provider = 'clerk'
    AND m.external_subject = v_actor
    AND m.status = 'active'
    AND m.access_role = 'owner'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  v_grant_id := public.polivo_new_id('lsg_');
  v_expires := now() + make_interval(secs => v_ttl);

  INSERT INTO public.local_staff_setup_grants (
    id, tenant_id, secret_digest, status, expires_at,
    authorizing_owner_subject, owner_membership_id, created_at
  ) VALUES (
    v_grant_id, p_tenant_id, lower(trim(p_secret_digest)), 'issued', v_expires,
    v_actor, v_membership_id, now()
  );

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'local_staff.setup_grant.authorize',
    'local_staff_setup_grant',
    v_grant_id,
    NULL,
    jsonb_build_object('expires_at', v_expires),
    NULL
  );

  grant_id := v_grant_id;
  expires_at := v_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_local_staff_setup_grant(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_local_staff_setup_grant(text, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_local_staff_setup_grant(
  p_secret_digest text,
  p_tenant_id text
)
RETURNS TABLE (
  grant_id text,
  tenant_id text,
  cloud_membership_id text,
  owner_display_name text,
  capabilities jsonb,
  source_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant public.local_staff_setup_grants%ROWTYPE;
  v_membership public.tenant_memberships%ROWTYPE;
  v_owner_ok boolean;
BEGIN
  IF p_secret_digest IS NULL OR char_length(trim(p_secret_digest)) < 32 THEN
    RAISE EXCEPTION 'INVALID_SECRET' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_grant
  FROM public.local_staff_setup_grants g
  WHERE g.secret_digest = lower(trim(p_secret_digest))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_SECRET' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.status = 'consumed' THEN
    RAISE EXCEPTION 'ALREADY_CONSUMED' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.status <> 'issued' THEN
    RAISE EXCEPTION 'INVALID_SECRET' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.expires_at <= now() THEN
    UPDATE public.local_staff_setup_grants
    SET status = 'expired'
    WHERE id = v_grant.id;
    RAISE EXCEPTION 'EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.id = v_grant.owner_membership_id
      AND m.tenant_id = v_grant.tenant_id
      AND m.external_subject = v_grant.authorizing_owner_subject
      AND m.status = 'active'
      AND m.access_role = 'owner'
  ) INTO v_owner_ok;

  IF NOT v_owner_ok THEN
    UPDATE public.local_staff_setup_grants
    SET status = 'cancelled'
    WHERE id = v_grant.id;
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_membership
  FROM public.tenant_memberships
  WHERE id = v_grant.owner_membership_id;

  UPDATE public.local_staff_setup_grants
  SET status = 'consumed', consumed_at = now()
  WHERE id = v_grant.id AND status = 'issued';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_CONSUMED' USING ERRCODE = 'P0001';
  END IF;

  grant_id := v_grant.id;
  tenant_id := v_grant.tenant_id;
  cloud_membership_id := v_membership.id;
  owner_display_name := COALESCE(
    (
      SELECT NULLIF(trim(t.display_name), '')
      FROM public.tenants t
      WHERE t.id = v_grant.tenant_id
    ),
    'Owner'
  );
  capabilities := '[]'::jsonb;
  source_revision := 1;
  RETURN NEXT;
END;
$$;

-- Machine redeem uses privileged server client (service role), not end-user JWT.
REVOKE ALL ON FUNCTION public.redeem_local_staff_setup_grant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_local_staff_setup_grant(text, text) TO service_role;
