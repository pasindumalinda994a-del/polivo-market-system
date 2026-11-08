-- CR-08: reject wrong-role redeem before consume (ROLE_MISMATCH).
-- CR-09: revoke polivo_write_admin_audit EXECUTE from API roles.
-- Prefer forward migration: drop 6-arg redeem overload, replace with 7-arg signature.

DROP FUNCTION IF EXISTS public.redeem_device_enrollment_grant(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.redeem_device_enrollment_grant(
  p_secret_digest text,
  p_installation_id text,
  p_public_key text,
  p_deployment_environment text,
  p_expected_role text,
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
  v_rev bigint;
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
  IF p_expected_role IS NULL OR trim(p_expected_role) NOT IN ('host', 'terminal') THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_ROLE' USING ERRCODE = 'P0001';
  END IF;
  IF p_possession_message IS NULL OR p_possession_signature IS NULL THEN
    RAISE EXCEPTION 'INVALID_POSSESSION_PROOF' USING ERRCODE = 'P0001';
  END IF;
  -- Signature cryptographic verification is enforced by the Next.js redeem route
  -- before calling this RPC. The RPC still binds installation + public key + role.

  SELECT * INTO v_grant
  FROM public.device_enrollment_grants g
  WHERE g.secret_digest = lower(trim(p_secret_digest))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRANT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Wrong-role must not consume the grant or burn redeem attempts.
  IF v_grant.device_role <> trim(p_expected_role) THEN
    RAISE EXCEPTION 'ROLE_MISMATCH' USING ERRCODE = 'P0001';
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
    IF v_device.role <> trim(p_expected_role) THEN
      RAISE EXCEPTION 'ROLE_MISMATCH' USING ERRCODE = 'P0001';
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

  v_rev := v_device.state_revision + 1;
  UPDATE public.tenant_devices
  SET installation_id = trim(p_installation_id),
      public_key = trim(p_public_key),
      enrollment_state = v_next_state,
      redeemed_at = now(),
      updated_at = now(),
      state_revision = v_rev
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

REVOKE ALL ON FUNCTION public.redeem_device_enrollment_grant(text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_device_enrollment_grant(text, text, text, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_device_enrollment_grant(text, text, text, text, text, text, text) TO service_role;

-- Audit helper is for SECURITY DEFINER callers only; API roles must not invoke it.
REVOKE ALL ON FUNCTION public.polivo_write_admin_audit(text, text, text, text, text, text, jsonb, jsonb, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.polivo_write_admin_audit(text, text, text, text, text, text, jsonb, jsonb, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.polivo_write_admin_audit(text, text, text, text, text, text, jsonb, jsonb, bigint) TO service_role;

NOTIFY pgrst, 'reload schema';
