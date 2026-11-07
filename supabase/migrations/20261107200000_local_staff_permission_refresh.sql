-- Phase 15 follow-on (ADR 0013): membership capability revision + trusted permission refresh grants.
-- Refresh redeems live membership capabilities; argv-only re-stamping is not authority.

ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS capabilities_revision bigint NOT NULL DEFAULT 1;

UPDATE public.tenant_memberships
SET capabilities_revision = 1
WHERE capabilities_revision IS NULL;

CREATE OR REPLACE FUNCTION public.update_membership_access(
  p_tenant_id text,
  p_membership_id text,
  p_status text DEFAULT NULL,
  p_access_role text DEFAULT NULL,
  p_capabilities jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_row public.tenant_memberships%ROWTYPE;
  v_new_status text;
  v_new_role text;
  v_new_caps jsonb;
  v_active_owners integer;
  v_bump_revision boolean;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row
  FROM public.tenant_memberships AS m
  WHERE m.id = p_membership_id AND m.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_new_status := COALESCE(p_status, v_row.status);
  v_new_role := COALESCE(p_access_role, v_row.access_role);
  v_new_caps := COALESCE(p_capabilities, v_row.capabilities);

  IF v_new_status NOT IN ('active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = 'P0001';
  END IF;
  IF v_new_role NOT IN ('owner', 'billing_staff', 'cashier') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.access_role = 'owner' AND v_new_role <> 'owner' THEN
    RAISE EXCEPTION 'OWNERSHIP_TRANSFER_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.access_role <> 'owner' AND v_new_role = 'owner' THEN
    RAISE EXCEPTION 'OWNERSHIP_TRANSFER_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.polivo_capabilities_are_known(v_new_caps) THEN
    RAISE EXCEPTION 'UNKNOWN_CAPABILITY' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.access_role = 'owner' AND v_row.status = 'active' AND v_new_status <> 'active' THEN
    SELECT count(*)::integer INTO v_active_owners
    FROM public.tenant_memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.access_role = 'owner'
      AND m.status = 'active'
      AND m.id <> p_membership_id;
    IF v_active_owners < 1 THEN
      RAISE EXCEPTION 'LAST_OWNER' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_new_role = 'owner' THEN
    v_new_caps := '[]'::jsonb;
  END IF;

  v_bump_revision :=
    v_new_status IS DISTINCT FROM v_row.status
    OR v_new_role IS DISTINCT FROM v_row.access_role
    OR v_new_caps IS DISTINCT FROM v_row.capabilities;

  UPDATE public.tenant_memberships
  SET
    status = v_new_status,
    access_role = v_new_role,
    capabilities = v_new_caps,
    capabilities_revision = CASE
      WHEN v_bump_revision THEN v_row.capabilities_revision + 1
      ELSE v_row.capabilities_revision
    END,
    updated_at = now()
  WHERE id = p_membership_id;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'membership.updated',
    'membership',
    p_membership_id,
    jsonb_build_object(
      'status', v_row.status,
      'access_role', v_row.access_role,
      'capabilities', v_row.capabilities,
      'capabilities_revision', v_row.capabilities_revision
    ),
    jsonb_build_object(
      'status', v_new_status,
      'access_role', v_new_role,
      'capabilities', v_new_caps,
      'capabilities_revision', CASE
        WHEN v_bump_revision THEN v_row.capabilities_revision + 1
        ELSE v_row.capabilities_revision
      END
    ),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_membership_access(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_membership_access(text, text, text, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_membership_access(text, text, text, text, jsonb) FROM anon;

CREATE TABLE public.local_staff_permission_refresh_grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  target_membership_id text NOT NULL REFERENCES public.tenant_memberships (id) ON DELETE CASCADE,
  secret_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('issued', 'consumed', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  authorizing_owner_subject text NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (secret_digest)
);

CREATE INDEX local_staff_permission_refresh_grants_tenant_status_idx
  ON public.local_staff_permission_refresh_grants (tenant_id, status);

ALTER TABLE public.local_staff_permission_refresh_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_staff_permission_refresh_grants FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.local_staff_permission_refresh_grants FROM PUBLIC, anon, authenticated;

CREATE POLICY local_staff_permission_refresh_grants_no_direct_access
  ON public.local_staff_permission_refresh_grants
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.authorize_local_staff_permission_refresh(
  p_tenant_id text,
  p_target_membership_id text,
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
  v_target public.tenant_memberships%ROWTYPE;
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

  SELECT * INTO v_target
  FROM public.tenant_memberships m
  WHERE m.id = p_target_membership_id
    AND m.tenant_id = p_tenant_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_target.status <> 'active' THEN
    RAISE EXCEPTION 'MEMBERSHIP_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  v_grant_id := public.polivo_new_id('lpr_');
  v_expires := now() + make_interval(secs => v_ttl);

  INSERT INTO public.local_staff_permission_refresh_grants (
    id, tenant_id, target_membership_id, secret_digest, status, expires_at,
    authorizing_owner_subject, created_at
  ) VALUES (
    v_grant_id, p_tenant_id, p_target_membership_id, lower(trim(p_secret_digest)), 'issued', v_expires,
    v_actor, now()
  );

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'local_staff.permission_refresh.authorize',
    'local_staff_permission_refresh_grant',
    v_grant_id,
    NULL,
    jsonb_build_object(
      'expires_at', v_expires,
      'target_membership_id', p_target_membership_id
    ),
    NULL
  );

  grant_id := v_grant_id;
  expires_at := v_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_local_staff_permission_refresh(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_local_staff_permission_refresh(text, text, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_local_staff_permission_refresh(
  p_secret_digest text,
  p_tenant_id text,
  p_expected_membership_id text DEFAULT NULL
)
RETURNS TABLE (
  grant_id text,
  tenant_id text,
  cloud_membership_id text,
  capabilities jsonb,
  source_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant public.local_staff_permission_refresh_grants%ROWTYPE;
  v_membership public.tenant_memberships%ROWTYPE;
BEGIN
  IF p_secret_digest IS NULL OR char_length(trim(p_secret_digest)) < 32 THEN
    RAISE EXCEPTION 'INVALID_SECRET' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_grant
  FROM public.local_staff_permission_refresh_grants g
  WHERE g.secret_digest = lower(trim(p_secret_digest))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_SECRET' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.status <> 'issued' THEN
    RAISE EXCEPTION 'GRANT_NOT_REDEEMABLE' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.expires_at <= now() THEN
    UPDATE public.local_staff_permission_refresh_grants
    SET status = 'expired'
    WHERE id = v_grant.id AND status = 'issued';
    RAISE EXCEPTION 'GRANT_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_membership_id IS NOT NULL
     AND p_expected_membership_id <> v_grant.target_membership_id THEN
    RAISE EXCEPTION 'MEMBERSHIP_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_membership
  FROM public.tenant_memberships m
  WHERE m.id = v_grant.target_membership_id
    AND m.tenant_id = v_grant.tenant_id
  FOR SHARE;

  IF NOT FOUND OR v_membership.status <> 'active' THEN
    RAISE EXCEPTION 'MEMBERSHIP_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  -- Owner cloud memberships store empty capabilities by design.
  IF v_membership.access_role = 'owner' THEN
    v_membership.capabilities := '[]'::jsonb;
  END IF;

  UPDATE public.local_staff_permission_refresh_grants
  SET status = 'consumed', consumed_at = now()
  WHERE id = v_grant.id AND status = 'issued';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRANT_NOT_REDEEMABLE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    v_grant.tenant_id,
    v_grant.authorizing_owner_subject,
    'local_staff.permission_refresh.redeem',
    'local_staff_permission_refresh_grant',
    v_grant.id,
    NULL,
    jsonb_build_object(
      'target_membership_id', v_membership.id,
      'capabilities_revision', v_membership.capabilities_revision
    ),
    NULL
  );

  grant_id := v_grant.id;
  tenant_id := v_grant.tenant_id;
  cloud_membership_id := v_membership.id;
  capabilities := COALESCE(v_membership.capabilities, '[]'::jsonb);
  source_revision := v_membership.capabilities_revision;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_local_staff_permission_refresh(text, text, text) FROM PUBLIC;
-- Machine redeem uses service role (privileged client), not end-user JWT.
GRANT EXECUTE ON FUNCTION public.redeem_local_staff_permission_refresh(text, text, text) TO service_role;
