-- Phase 14: stall host / terminal device enrollment.
-- Owner mutations via SECURITY DEFINER + is_active_tenant_owner.
-- Redeem/confirm via SECURITY DEFINER validating grant digests / device possession
-- (invoked from Next.js with privileged server client; no device Clerk session).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.tenant_devices (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  device_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('host', 'terminal')),
  installation_id text NOT NULL,
  public_key text NOT NULL,
  credential_version integer NOT NULL CHECK (credential_version >= 1),
  label text,
  enrollment_state text NOT NULL CHECK (
    enrollment_state IN (
      'reserved',
      'redeemed',
      'activated',
      'revoked',
      'waiting_host_confirm'
    )
  ),
  intended_host_device_id text,
  deployment_environment text NOT NULL,
  state_revision bigint NOT NULL DEFAULT 1 CHECK (state_revision >= 1),
  authorized_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (tenant_id, device_id),
  UNIQUE (tenant_id, installation_id),
  CHECK (
    (role = 'host' AND intended_host_device_id IS NULL)
    OR (role = 'terminal' AND intended_host_device_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX tenant_devices_one_active_host_per_tenant
  ON public.tenant_devices (tenant_id)
  WHERE role = 'host' AND enrollment_state IN ('reserved', 'redeemed', 'activated');

CREATE INDEX tenant_devices_tenant_role_idx
  ON public.tenant_devices (tenant_id, role);

CREATE TABLE public.device_enrollment_grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  device_role text NOT NULL CHECK (device_role IN ('host', 'terminal')),
  intended_host_device_id text,
  reserved_device_id text NOT NULL,
  secret_digest text NOT NULL,
  deployment_environment text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('issued', 'consumed', 'cancelled', 'expired')
  ),
  expires_at timestamptz NOT NULL,
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts >= 1),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  authorizing_owner_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  cancelled_at timestamptz,
  consumed_by_installation_id text,
  consumed_device_row_id text REFERENCES public.tenant_devices (id) ON DELETE RESTRICT,
  CHECK (
    (device_role = 'host' AND intended_host_device_id IS NULL)
    OR (device_role = 'terminal' AND intended_host_device_id IS NOT NULL)
  )
);

CREATE INDEX device_enrollment_grants_tenant_status_idx
  ON public.device_enrollment_grants (tenant_id, status);

CREATE UNIQUE INDEX device_enrollment_grants_secret_digest_uidx
  ON public.device_enrollment_grants (secret_digest);

-- Owner-readable metadata view (no public keys, digests, or internal recovery fields).
CREATE OR REPLACE VIEW public.tenant_device_directory
WITH (security_invoker = true)
AS
SELECT
  d.tenant_id,
  d.device_id,
  d.role,
  d.label,
  d.enrollment_state,
  d.intended_host_device_id,
  d.deployment_environment,
  d.state_revision,
  d.created_at,
  d.updated_at,
  d.redeemed_at,
  d.activated_at,
  d.revoked_at
FROM public.tenant_devices d;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.device_enrollment_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_enrollment_grants FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_devices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.device_enrollment_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tenant_device_directory FROM PUBLIC, anon, authenticated;

-- No direct authenticated table reads: public keys and grant digests stay off
-- ordinary user SELECT. Owners use list_tenant_devices / authorize / revoke RPCs.

CREATE POLICY tenant_devices_no_direct_access
  ON public.tenant_devices
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY device_enrollment_grants_no_direct_access
  ON public.device_enrollment_grants
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Owner: authorize host
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.authorize_host_enrollment(
  p_tenant_id text,
  p_secret_digest text,
  p_deployment_environment text,
  p_label text DEFAULT NULL,
  p_ttl_seconds integer DEFAULT 900
)
RETURNS TABLE (
  grant_id text,
  reserved_device_id text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_grant_id text;
  v_device_id text;
  v_device_row_id text;
  v_expires timestamptz;
  v_env text;
  v_label text;
  v_ttl integer;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_secret_digest IS NULL OR char_length(trim(p_secret_digest)) < 32 THEN
    RAISE EXCEPTION 'INVALID_SECRET_DIGEST' USING ERRCODE = 'P0001';
  END IF;

  v_env := trim(COALESCE(p_deployment_environment, ''));
  IF v_env NOT IN ('development', 'staging', 'production') THEN
    RAISE EXCEPTION 'INVALID_DEPLOYMENT_ENVIRONMENT' USING ERRCODE = 'P0001';
  END IF;

  v_ttl := COALESCE(p_ttl_seconds, 900);
  IF v_ttl < 60 OR v_ttl > 3600 THEN
    RAISE EXCEPTION 'INVALID_TTL' USING ERRCODE = 'P0001';
  END IF;

  v_label := NULLIF(trim(COALESCE(p_label, '')), '');

  IF EXISTS (
    SELECT 1 FROM public.tenant_devices d
    WHERE d.tenant_id = p_tenant_id
      AND d.role = 'host'
      AND d.enrollment_state IN ('reserved', 'redeemed', 'activated')
  ) THEN
    RAISE EXCEPTION 'HOST_ALREADY_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  v_grant_id := public.polivo_new_id('dgr_');
  v_device_id := public.polivo_new_id('dev_');
  v_device_row_id := public.polivo_new_id('tdv_');
  v_expires := now() + make_interval(secs => v_ttl);

  INSERT INTO public.tenant_devices (
    id, tenant_id, device_id, role, installation_id, public_key, credential_version,
    label, enrollment_state, intended_host_device_id, deployment_environment,
    state_revision, authorized_by_subject, created_at, updated_at
  ) VALUES (
    v_device_row_id, p_tenant_id, v_device_id, 'host',
    'pending:' || v_device_id, 'pending', 1,
    v_label, 'reserved', NULL, v_env,
    1, v_actor, now(), now()
  );

  INSERT INTO public.device_enrollment_grants (
    id, tenant_id, device_role, intended_host_device_id, reserved_device_id,
    secret_digest, deployment_environment, status, expires_at,
    authorizing_owner_subject, created_at
  ) VALUES (
    v_grant_id, p_tenant_id, 'host', NULL, v_device_id,
    lower(trim(p_secret_digest)), v_env, 'issued', v_expires,
    v_actor, now()
  );

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'device.host.authorize',
    'device_enrollment_grant',
    v_grant_id,
    NULL,
    jsonb_build_object(
      'reserved_device_id', v_device_id,
      'deployment_environment', v_env,
      'expires_at', v_expires
    ),
    1
  );

  grant_id := v_grant_id;
  reserved_device_id := v_device_id;
  expires_at := v_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_host_enrollment(text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_host_enrollment(text, text, text, text, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.authorize_host_enrollment(text, text, text, text, integer) FROM anon;

-- ---------------------------------------------------------------------------
-- Owner: authorize terminal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.authorize_terminal_enrollment(
  p_tenant_id text,
  p_host_device_id text,
  p_secret_digest text,
  p_deployment_environment text,
  p_label text DEFAULT NULL,
  p_ttl_seconds integer DEFAULT 900
)
RETURNS TABLE (
  grant_id text,
  reserved_device_id text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_grant_id text;
  v_device_id text;
  v_device_row_id text;
  v_expires timestamptz;
  v_env text;
  v_label text;
  v_ttl integer;
  v_host public.tenant_devices%ROWTYPE;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_secret_digest IS NULL OR char_length(trim(p_secret_digest)) < 32 THEN
    RAISE EXCEPTION 'INVALID_SECRET_DIGEST' USING ERRCODE = 'P0001';
  END IF;

  v_env := trim(COALESCE(p_deployment_environment, ''));
  IF v_env NOT IN ('development', 'staging', 'production') THEN
    RAISE EXCEPTION 'INVALID_DEPLOYMENT_ENVIRONMENT' USING ERRCODE = 'P0001';
  END IF;

  v_ttl := COALESCE(p_ttl_seconds, 900);
  IF v_ttl < 60 OR v_ttl > 3600 THEN
    RAISE EXCEPTION 'INVALID_TTL' USING ERRCODE = 'P0001';
  END IF;

  v_label := NULLIF(trim(COALESCE(p_label, '')), '');

  SELECT * INTO v_host
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id
    AND d.device_id = p_host_device_id
    AND d.role = 'host'
  FOR UPDATE;

  IF NOT FOUND OR v_host.enrollment_state <> 'activated' OR v_host.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'HOST_NOT_ACTIVATED' USING ERRCODE = 'P0001';
  END IF;

  IF v_host.deployment_environment <> v_env THEN
    RAISE EXCEPTION 'ENVIRONMENT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  v_grant_id := public.polivo_new_id('dgr_');
  v_device_id := public.polivo_new_id('dev_');
  v_device_row_id := public.polivo_new_id('tdv_');
  v_expires := now() + make_interval(secs => v_ttl);

  INSERT INTO public.tenant_devices (
    id, tenant_id, device_id, role, installation_id, public_key, credential_version,
    label, enrollment_state, intended_host_device_id, deployment_environment,
    state_revision, authorized_by_subject, created_at, updated_at
  ) VALUES (
    v_device_row_id, p_tenant_id, v_device_id, 'terminal',
    'pending:' || v_device_id, 'pending', 1,
    v_label, 'reserved', p_host_device_id, v_env,
    1, v_actor, now(), now()
  );

  INSERT INTO public.device_enrollment_grants (
    id, tenant_id, device_role, intended_host_device_id, reserved_device_id,
    secret_digest, deployment_environment, status, expires_at,
    authorizing_owner_subject, created_at
  ) VALUES (
    v_grant_id, p_tenant_id, 'terminal', p_host_device_id, v_device_id,
    lower(trim(p_secret_digest)), v_env, 'issued', v_expires,
    v_actor, now()
  );

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'device.terminal.authorize',
    'device_enrollment_grant',
    v_grant_id,
    NULL,
    jsonb_build_object(
      'reserved_device_id', v_device_id,
      'host_device_id', p_host_device_id,
      'deployment_environment', v_env,
      'expires_at', v_expires
    ),
    1
  );

  grant_id := v_grant_id;
  reserved_device_id := v_device_id;
  expires_at := v_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_terminal_enrollment(text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_terminal_enrollment(text, text, text, text, text, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.authorize_terminal_enrollment(text, text, text, text, text, integer) FROM anon;

-- ---------------------------------------------------------------------------
-- Owner: list devices (metadata only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_tenant_devices(p_tenant_id text)
RETURNS TABLE (
  device_id text,
  role text,
  label text,
  enrollment_state text,
  intended_host_device_id text,
  deployment_environment text,
  state_revision bigint,
  created_at timestamptz,
  updated_at timestamptz,
  redeemed_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    d.device_id,
    d.role,
    d.label,
    d.enrollment_state,
    d.intended_host_device_id,
    d.deployment_environment,
    d.state_revision,
    d.created_at,
    d.updated_at,
    d.redeemed_at,
    d.activated_at,
    d.revoked_at
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id
  ORDER BY d.created_at ASC, d.device_id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_tenant_devices(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_tenant_devices(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_tenant_devices(text) FROM anon;

-- ---------------------------------------------------------------------------
-- Owner: cancel unused grant
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_device_enrollment_grant(
  p_tenant_id text,
  p_grant_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_grant public.device_enrollment_grants%ROWTYPE;
  v_device public.tenant_devices%ROWTYPE;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_grant
  FROM public.device_enrollment_grants g
  WHERE g.id = p_grant_id AND g.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRANT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.status <> 'issued' THEN
    RAISE EXCEPTION 'GRANT_NOT_CANCELLABLE' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.device_enrollment_grants
  SET status = 'cancelled', cancelled_at = now()
  WHERE id = v_grant.id;

  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id AND d.device_id = v_grant.reserved_device_id
  FOR UPDATE;

  IF FOUND AND v_device.enrollment_state = 'reserved' THEN
    UPDATE public.tenant_devices
    SET enrollment_state = 'revoked',
        revoked_at = now(),
        updated_at = now(),
        state_revision = state_revision + 1
    WHERE id = v_device.id;
  END IF;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'device.grant.cancel',
    'device_enrollment_grant',
    p_grant_id,
    jsonb_build_object('status', 'issued'),
    jsonb_build_object('status', 'cancelled'),
    1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_device_enrollment_grant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_device_enrollment_grant(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_device_enrollment_grant(text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- Owner: revoke device
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_tenant_device(
  p_tenant_id text,
  p_device_id text
)
RETURNS TABLE (state_revision bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_device public.tenant_devices%ROWTYPE;
  v_rev bigint;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id AND d.device_id = p_device_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_device.enrollment_state = 'revoked' THEN
    state_revision := v_device.state_revision;
    RETURN NEXT;
    RETURN;
  END IF;

  v_rev := v_device.state_revision + 1;
  UPDATE public.tenant_devices
  SET enrollment_state = 'revoked',
      revoked_at = now(),
      updated_at = now(),
      state_revision = v_rev
  WHERE id = v_device.id;

  UPDATE public.device_enrollment_grants g
  SET status = 'cancelled', cancelled_at = COALESCE(g.cancelled_at, now())
  WHERE g.tenant_id = p_tenant_id
    AND g.reserved_device_id = p_device_id
    AND g.status = 'issued';

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'device.revoke',
    'tenant_device',
    p_device_id,
    jsonb_build_object('enrollment_state', v_device.enrollment_state),
    jsonb_build_object('enrollment_state', 'revoked', 'state_revision', v_rev),
    v_rev
  );

  state_revision := v_rev;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_tenant_device(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_device(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_tenant_device(text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- Redeem grant (privileged server / service_role). Validates digest + owner still active.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_device_enrollment_grant(
  p_secret_digest text,
  p_installation_id text,
  p_public_key text,
  p_deployment_environment text,
  p_possession_message text,
  p_possession_signature text
)
RETURNS TABLE (
  tenant_id text,
  device_id text,
  role text,
  intended_host_device_id text,
  label text,
  credential_version integer,
  state_revision bigint,
  enrollment_state text,
  stall_display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grant public.device_enrollment_grants%ROWTYPE;
  v_device public.tenant_devices%ROWTYPE;
  v_owner_ok boolean;
  v_tenant public.tenants%ROWTYPE;
  v_next_state text;
BEGIN
  IF p_secret_digest IS NULL OR char_length(trim(p_secret_digest)) < 32 THEN
    RAISE EXCEPTION 'INVALID_SECRET_DIGEST' USING ERRCODE = 'P0001';
  END IF;
  IF p_installation_id IS NULL OR char_length(trim(p_installation_id)) < 1 THEN
    RAISE EXCEPTION 'INVALID_INSTALLATION' USING ERRCODE = 'P0001';
  END IF;
  IF p_public_key IS NULL OR char_length(trim(p_public_key)) < 16 THEN
    RAISE EXCEPTION 'INVALID_PUBLIC_KEY' USING ERRCODE = 'P0001';
  END IF;
  IF p_possession_message IS NULL OR p_possession_signature IS NULL THEN
    RAISE EXCEPTION 'INVALID_POSSESSION_PROOF' USING ERRCODE = 'P0001';
  END IF;
  -- Signature cryptographic verification is enforced by the Next.js redeem route
  -- before calling this RPC. The RPC still binds installation + public key.

  SELECT * INTO v_grant
  FROM public.device_enrollment_grants g
  WHERE g.secret_digest = lower(trim(p_secret_digest))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRANT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_grant.attempt_count := v_grant.attempt_count + 1;
  UPDATE public.device_enrollment_grants
  SET attempt_count = v_grant.attempt_count
  WHERE id = v_grant.id;

  IF v_grant.attempt_count > v_grant.max_attempts THEN
    RAISE EXCEPTION 'GRANT_ATTEMPTS_EXCEEDED' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.status = 'consumed'
     AND v_grant.consumed_by_installation_id IS NOT NULL
     AND v_grant.consumed_by_installation_id = trim(p_installation_id) THEN
    -- Resume: same installation reclaiming its consumed grant.
    SELECT * INTO v_device FROM public.tenant_devices WHERE id = v_grant.consumed_device_row_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_device.public_key <> trim(p_public_key) OR v_device.installation_id <> trim(p_installation_id) THEN
      RAISE EXCEPTION 'INSTALLATION_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
    IF v_device.enrollment_state = 'revoked' THEN
      RAISE EXCEPTION 'DEVICE_REVOKED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_tenant FROM public.tenants t WHERE t.id = v_device.tenant_id;
    tenant_id := v_device.tenant_id;
    device_id := v_device.device_id;
    role := v_device.role;
    intended_host_device_id := v_device.intended_host_device_id;
    label := v_device.label;
    credential_version := v_device.credential_version;
    state_revision := v_device.state_revision;
    enrollment_state := v_device.enrollment_state;
    stall_display_name := v_tenant.display_name;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_grant.status <> 'issued' THEN
    RAISE EXCEPTION 'GRANT_NOT_REDEEMABLE' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.expires_at <= now() THEN
    UPDATE public.device_enrollment_grants SET status = 'expired' WHERE id = v_grant.id;
    RAISE EXCEPTION 'GRANT_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.deployment_environment <> trim(p_deployment_environment) THEN
    RAISE EXCEPTION 'ENVIRONMENT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id = v_grant.tenant_id
      AND m.external_subject = v_grant.authorizing_owner_subject
      AND m.identity_provider = 'clerk'
      AND m.status = 'active'
      AND m.access_role = 'owner'
  ) INTO v_owner_ok;

  IF NOT v_owner_ok THEN
    UPDATE public.device_enrollment_grants SET status = 'cancelled', cancelled_at = now() WHERE id = v_grant.id;
    RAISE EXCEPTION 'AUTHORIZING_OWNER_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants t WHERE t.id = v_grant.tenant_id FOR UPDATE;
  IF NOT FOUND OR v_tenant.status <> 'active' THEN
    RAISE EXCEPTION 'TENANT_NOT_ELIGIBLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = v_grant.tenant_id AND d.device_id = v_grant.reserved_device_id
  FOR UPDATE;

  IF NOT FOUND OR v_device.enrollment_state <> 'reserved' THEN
    RAISE EXCEPTION 'DEVICE_NOT_RESERVABLE' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_devices d
    WHERE d.tenant_id = v_grant.tenant_id
      AND d.installation_id = trim(p_installation_id)
      AND d.device_id <> v_device.device_id
  ) THEN
    RAISE EXCEPTION 'INSTALLATION_ALREADY_REGISTERED' USING ERRCODE = 'P0001';
  END IF;

  IF v_grant.device_role = 'host' THEN
    v_next_state := 'redeemed';
  ELSE
    v_next_state := 'waiting_host_confirm';
  END IF;

  UPDATE public.tenant_devices
  SET installation_id = trim(p_installation_id),
      public_key = trim(p_public_key),
      enrollment_state = v_next_state,
      redeemed_at = now(),
      updated_at = now(),
      state_revision = state_revision + 1
  WHERE id = v_device.id
  RETURNING * INTO v_device;

  UPDATE public.device_enrollment_grants
  SET status = 'consumed',
      consumed_at = now(),
      consumed_by_installation_id = trim(p_installation_id),
      consumed_device_row_id = v_device.id
  WHERE id = v_grant.id;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    v_device.tenant_id,
    v_grant.authorizing_owner_subject,
    'device.grant.redeem',
    'tenant_device',
    v_device.device_id,
    jsonb_build_object('enrollment_state', 'reserved'),
    jsonb_build_object(
      'enrollment_state', v_next_state,
      'installation_id', trim(p_installation_id),
      'state_revision', v_device.state_revision
    ),
    v_device.state_revision
  );

  tenant_id := v_device.tenant_id;
  device_id := v_device.device_id;
  role := v_device.role;
  intended_host_device_id := v_device.intended_host_device_id;
  label := v_device.label;
  credential_version := v_device.credential_version;
  state_revision := v_device.state_revision;
  enrollment_state := v_device.enrollment_state;
  stall_display_name := v_tenant.display_name;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_device_enrollment_grant(text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_device_enrollment_grant(text, text, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_device_enrollment_grant(text, text, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Confirm host activation / host-accepted terminal (privileged server)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_device_enrollment(
  p_tenant_id text,
  p_device_id text,
  p_installation_id text,
  p_public_key text,
  p_credential_version integer,
  p_possession_message text,
  p_possession_signature text
)
RETURNS TABLE (
  enrollment_state text,
  state_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device public.tenant_devices%ROWTYPE;
  v_next text;
BEGIN
  IF p_possession_message IS NULL OR p_possession_signature IS NULL THEN
    RAISE EXCEPTION 'INVALID_POSSESSION_PROOF' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id AND d.device_id = p_device_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_device.enrollment_state = 'revoked' THEN
    RAISE EXCEPTION 'DEVICE_REVOKED' USING ERRCODE = 'P0001';
  END IF;

  IF v_device.installation_id <> trim(p_installation_id)
     OR v_device.public_key <> trim(p_public_key)
     OR v_device.credential_version <> p_credential_version THEN
    RAISE EXCEPTION 'INSTALLATION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_device.role = 'host' THEN
    IF v_device.enrollment_state NOT IN ('redeemed', 'activated') THEN
      RAISE EXCEPTION 'DEVICE_NOT_CONFIRMABLE' USING ERRCODE = 'P0001';
    END IF;
    v_next := 'activated';
  ELSE
    IF v_device.enrollment_state NOT IN ('waiting_host_confirm', 'activated') THEN
      RAISE EXCEPTION 'DEVICE_NOT_CONFIRMABLE' USING ERRCODE = 'P0001';
    END IF;
    v_next := 'activated';
  END IF;

  IF v_device.enrollment_state = 'activated' THEN
    enrollment_state := v_device.enrollment_state;
    state_revision := v_device.state_revision;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.tenant_devices
  SET enrollment_state = v_next,
      activated_at = COALESCE(activated_at, now()),
      updated_at = now(),
      state_revision = state_revision + 1
  WHERE id = v_device.id
  RETURNING * INTO v_device;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    v_device.tenant_id,
    v_device.authorized_by_subject,
    'device.confirm',
    'tenant_device',
    v_device.device_id,
    NULL,
    jsonb_build_object(
      'enrollment_state', v_next,
      'state_revision', v_device.state_revision
    ),
    v_device.state_revision
  );

  enrollment_state := v_device.enrollment_state;
  state_revision := v_device.state_revision;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_device_enrollment(text, text, text, text, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_device_enrollment(text, text, text, text, integer, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_device_enrollment(text, text, text, text, integer, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Rotate credential (privileged; prove new key before retiring old version)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rotate_device_credential(
  p_tenant_id text,
  p_device_id text,
  p_installation_id text,
  p_previous_public_key text,
  p_previous_credential_version integer,
  p_new_public_key text,
  p_new_credential_version integer,
  p_possession_message text,
  p_possession_signature text
)
RETURNS TABLE (
  credential_version integer,
  state_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device public.tenant_devices%ROWTYPE;
BEGIN
  IF p_new_credential_version <> p_previous_credential_version + 1 THEN
    RAISE EXCEPTION 'INVALID_CREDENTIAL_VERSION' USING ERRCODE = 'P0001';
  END IF;
  IF p_possession_message IS NULL OR p_possession_signature IS NULL THEN
    RAISE EXCEPTION 'INVALID_POSSESSION_PROOF' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id AND d.device_id = p_device_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_device.enrollment_state = 'revoked' THEN
    RAISE EXCEPTION 'DEVICE_REVOKED' USING ERRCODE = 'P0001';
  END IF;
  IF v_device.installation_id <> trim(p_installation_id) THEN
    RAISE EXCEPTION 'INSTALLATION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  -- Resume interrupted rotation: already on new version with matching key.
  IF v_device.credential_version = p_new_credential_version
     AND v_device.public_key = trim(p_new_public_key) THEN
    credential_version := v_device.credential_version;
    state_revision := v_device.state_revision;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_device.public_key <> trim(p_previous_public_key)
     OR v_device.credential_version <> p_previous_credential_version THEN
    RAISE EXCEPTION 'INSTALLATION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tenant_devices
  SET public_key = trim(p_new_public_key),
      credential_version = p_new_credential_version,
      updated_at = now(),
      state_revision = state_revision + 1
  WHERE id = v_device.id
  RETURNING * INTO v_device;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    v_device.tenant_id,
    v_device.authorized_by_subject,
    'device.credential.rotate',
    'tenant_device',
    v_device.device_id,
    jsonb_build_object('credential_version', p_previous_credential_version),
    jsonb_build_object('credential_version', p_new_credential_version, 'state_revision', v_device.state_revision),
    v_device.state_revision
  );

  credential_version := v_device.credential_version;
  state_revision := v_device.state_revision;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_device_credential(text, text, text, text, integer, text, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rotate_device_credential(text, text, text, text, integer, text, integer, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_device_credential(text, text, text, text, integer, text, integer, text, text) TO service_role;
