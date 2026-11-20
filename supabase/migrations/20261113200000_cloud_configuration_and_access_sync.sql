-- Phase 33: versioned cloud configuration publications and host acknowledgements.
-- Domain v1: complete-replacement "access" snapshots only.

CREATE TABLE IF NOT EXISTS public.cloud_config_publications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  stall_id text NOT NULL,
  domain text NOT NULL CHECK (domain IN ('access')),
  revision bigint NOT NULL CHECK (revision > 0),
  publication_id text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  schema_version text NOT NULL DEFAULT '1',
  protocol_version text NOT NULL DEFAULT '1',
  required_compatibility_version integer NOT NULL DEFAULT 1,
  max_snapshot_age_ms bigint NOT NULL DEFAULT 604800000,
  issued_at timestamptz NOT NULL DEFAULT now(),
  published_by_subject text NOT NULL,
  UNIQUE (tenant_id, domain, revision),
  UNIQUE (publication_id)
);

CREATE INDEX IF NOT EXISTS cloud_config_publications_tenant_domain_rev_idx
  ON public.cloud_config_publications (tenant_id, domain, revision DESC);

CREATE TABLE IF NOT EXISTS public.cloud_config_host_acks (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  stall_id text NOT NULL,
  domain text NOT NULL CHECK (domain IN ('access')),
  host_device_id text NOT NULL,
  installation_id text NOT NULL,
  publication_id text NOT NULL,
  published_revision bigint NOT NULL CHECK (published_revision > 0),
  applied_revision bigint NOT NULL CHECK (applied_revision > 0),
  payload_hash text NOT NULL,
  result text NOT NULL CHECK (result IN ('applied', 'already_applied', 'rejected', 'blocked')),
  host_reported_applied_at timestamptz NOT NULL,
  server_receipt_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  message text,
  UNIQUE (tenant_id, domain, host_device_id, publication_id, result)
);

CREATE INDEX IF NOT EXISTS cloud_config_host_acks_latest_idx
  ON public.cloud_config_host_acks (tenant_id, domain, host_device_id, applied_revision DESC);

ALTER TABLE public.cloud_config_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_config_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_config_host_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_config_host_acks FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cloud_config_publications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cloud_config_host_acks FROM PUBLIC, anon, authenticated;

CREATE POLICY cloud_config_publications_no_direct_access
  ON public.cloud_config_publications
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY cloud_config_host_acks_no_direct_access
  ON public.cloud_config_host_acks
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Build complete access payload from current cloud authority tables.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.polivo_build_access_config_payload(p_tenant_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profiles jsonb;
  v_memberships jsonb;
  v_devices jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'profileRole', p.profile_role,
        'capabilities', p.capabilities,
        'revision', p.revision,
        'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
      ORDER BY p.profile_role
    ),
    '[]'::jsonb
  )
  INTO v_profiles
  FROM public.tenant_permission_profiles p
  WHERE p.tenant_id = p_tenant_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'membershipId', m.id,
        'status', m.status,
        'accessRole', m.access_role,
        'capabilities', COALESCE(m.capabilities, '[]'::jsonb),
        'capabilitiesRevision', m.capabilities_revision,
        'updatedAt', to_char(m.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
      ORDER BY m.id
    ),
    '[]'::jsonb
  )
  INTO v_memberships
  FROM public.tenant_memberships m
  WHERE m.tenant_id = p_tenant_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'deviceId', d.device_id,
        'role', d.role,
        'enrollmentState', d.enrollment_state,
        'installationId', d.installation_id,
        'credentialVersion', d.credential_version,
        'intendedHostDeviceId', d.intended_host_device_id,
        'revokedAt', CASE
          WHEN d.revoked_at IS NULL THEN NULL
          ELSE to_char(d.revoked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END,
        'label', d.label
      )
      ORDER BY d.device_id
    ),
    '[]'::jsonb
  )
  INTO v_devices
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'profiles', v_profiles,
    'memberships', v_memberships,
    'devices', v_devices
  );
END;
$$;

REVOKE ALL ON FUNCTION public.polivo_build_access_config_payload(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.polivo_build_access_config_payload(text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publish a new immutable access revision for the stall.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.polivo_publish_access_config(
  p_tenant_id text,
  p_published_by_subject text
)
RETURNS TABLE (
  revision bigint,
  publication_id text,
  payload_hash text,
  issued_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_hash text;
  v_revision bigint;
  v_publication_id text;
  v_row_id text;
  v_issued_at timestamptz := now();
BEGIN
  IF p_tenant_id IS NULL OR length(trim(p_tenant_id)) = 0 THEN
    RAISE EXCEPTION 'INVALID_TENANT' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize publications per tenant/domain.
  PERFORM 1
  FROM public.cloud_config_publications c
  WHERE c.tenant_id = p_tenant_id AND c.domain = 'access'
  FOR UPDATE;

  SELECT COALESCE(max(c.revision), 0) + 1
  INTO v_revision
  FROM public.cloud_config_publications c
  WHERE c.tenant_id = p_tenant_id AND c.domain = 'access';

  v_payload := public.polivo_build_access_config_payload(p_tenant_id);
  v_hash := encode(
    extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_publication_id := public.polivo_new_id('pub_');
  v_row_id := public.polivo_new_id('cfg_');

  INSERT INTO public.cloud_config_publications (
    id,
    tenant_id,
    stall_id,
    domain,
    revision,
    publication_id,
    payload,
    payload_hash,
    schema_version,
    protocol_version,
    required_compatibility_version,
    max_snapshot_age_ms,
    issued_at,
    published_by_subject
  ) VALUES (
    v_row_id,
    p_tenant_id,
    p_tenant_id,
    'access',
    v_revision,
    v_publication_id,
    v_payload,
    v_hash,
    '1',
    '1',
    1,
    604800000,
    v_issued_at,
    COALESCE(NULLIF(trim(p_published_by_subject), ''), 'system')
  );

  revision := v_revision;
  publication_id := v_publication_id;
  payload_hash := v_hash;
  issued_at := v_issued_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.polivo_publish_access_config(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.polivo_publish_access_config(text, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Owner-facing delivery status for access domain.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_access_config_delivery_status(p_tenant_id text)
RETURNS TABLE (
  domain text,
  published_revision bigint,
  last_acknowledged_revision bigint,
  local_application_status text,
  last_acknowledgement_at timestamptz,
  last_host_device_id text,
  failure_code text,
  failure_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pub_rev bigint;
  v_ack public.cloud_config_host_acks%ROWTYPE;
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT max(c.revision) INTO v_pub_rev
  FROM public.cloud_config_publications c
  WHERE c.tenant_id = p_tenant_id AND c.domain = 'access';

  SELECT a.* INTO v_ack
  FROM public.cloud_config_host_acks a
  WHERE a.tenant_id = p_tenant_id
    AND a.domain = 'access'
    AND a.result IN ('applied', 'already_applied')
  ORDER BY a.applied_revision DESC, a.server_receipt_at DESC
  LIMIT 1;

  domain := 'access';
  published_revision := v_pub_rev;
  last_acknowledged_revision := v_ack.applied_revision;
  last_acknowledgement_at := v_ack.server_receipt_at;
  last_host_device_id := v_ack.host_device_id;

  IF v_pub_rev IS NULL THEN
    local_application_status := 'pending_delivery';
    failure_code := NULL;
    failure_message := NULL;
  ELSIF v_ack.applied_revision IS NULL OR v_ack.applied_revision < v_pub_rev THEN
    local_application_status := 'pending_delivery';
    failure_code := NULL;
    failure_message := NULL;
  ELSIF v_ack.result IN ('rejected', 'blocked') THEN
    local_application_status := CASE WHEN v_ack.result = 'blocked' THEN 'blocked' ELSE 'failed' END;
    failure_code := v_ack.error_code;
    failure_message := v_ack.message;
  ELSE
    local_application_status := 'applied';
    failure_code := NULL;
    failure_message := NULL;
  END IF;

  -- Prefer latest failure if newer than successful ack for same published revision.
  IF v_pub_rev IS NOT NULL THEN
    SELECT a.* INTO v_ack
    FROM public.cloud_config_host_acks a
    WHERE a.tenant_id = p_tenant_id
      AND a.domain = 'access'
      AND a.published_revision = v_pub_rev
      AND a.result IN ('rejected', 'blocked')
    ORDER BY a.server_receipt_at DESC
    LIMIT 1;
    IF FOUND AND (last_acknowledged_revision IS NULL OR last_acknowledged_revision < v_pub_rev) THEN
      local_application_status := CASE WHEN v_ack.result = 'blocked' THEN 'blocked' ELSE 'failed' END;
      failure_code := v_ack.error_code;
      failure_message := v_ack.message;
      last_acknowledgement_at := v_ack.server_receipt_at;
      last_host_device_id := v_ack.host_device_id;
    END IF;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_access_config_delivery_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access_config_delivery_status(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_access_config_delivery_status(text) FROM anon;

-- ---------------------------------------------------------------------------
-- Privileged host pull (service role only).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.host_pull_access_config(
  p_tenant_id text,
  p_device_id text,
  p_installation_id text,
  p_credential_version bigint,
  p_known_revision bigint
)
RETURNS TABLE (
  outcome text,
  revision bigint,
  publication_id text,
  payload jsonb,
  payload_hash text,
  issued_at timestamptz,
  max_snapshot_age_ms bigint,
  schema_version text,
  protocol_version text,
  required_compatibility_version integer,
  published_revision bigint,
  last_acknowledged_revision bigint,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device public.tenant_devices%ROWTYPE;
  v_pub public.cloud_config_publications%ROWTYPE;
  v_ack_rev bigint;
BEGIN
  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id AND d.device_id = p_device_id
  FOR SHARE;

  IF NOT FOUND THEN
    outcome := 'unauthorized';
    message := 'Host device was not found.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_device.role <> 'host' THEN
    outcome := 'unauthorized';
    message := 'Only an activated host may pull configuration.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_device.enrollment_state = 'revoked' OR v_device.revoked_at IS NOT NULL THEN
    outcome := 'host_revoked';
    message := 'Host device is revoked.';
    published_revision := NULL;
    last_acknowledged_revision := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_device.enrollment_state <> 'activated' THEN
    outcome := 'unauthorized';
    message := 'Only an activated host may pull configuration.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_device.installation_id IS DISTINCT FROM p_installation_id
     OR v_device.credential_version IS DISTINCT FROM p_credential_version THEN
    outcome := 'unauthorized';
    message := 'Host credential identity mismatch.';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT max(a.applied_revision) INTO v_ack_rev
  FROM public.cloud_config_host_acks a
  WHERE a.tenant_id = p_tenant_id
    AND a.domain = 'access'
    AND a.host_device_id = p_device_id
    AND a.result IN ('applied', 'already_applied');

  SELECT * INTO v_pub
  FROM public.cloud_config_publications c
  WHERE c.tenant_id = p_tenant_id AND c.domain = 'access'
  ORDER BY c.revision DESC
  LIMIT 1;

  last_acknowledged_revision := v_ack_rev;

  IF NOT FOUND THEN
    outcome := 'up_to_date';
    published_revision := NULL;
    message := 'No access configuration has been published yet.';
    RETURN NEXT;
    RETURN;
  END IF;

  published_revision := v_pub.revision;

  IF p_known_revision IS NOT NULL AND p_known_revision >= v_pub.revision THEN
    outcome := 'up_to_date';
    revision := v_pub.revision;
    publication_id := v_pub.publication_id;
    payload_hash := v_pub.payload_hash;
    message := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  outcome := 'snapshot';
  revision := v_pub.revision;
  publication_id := v_pub.publication_id;
  payload := v_pub.payload;
  payload_hash := v_pub.payload_hash;
  issued_at := v_pub.issued_at;
  max_snapshot_age_ms := v_pub.max_snapshot_age_ms;
  schema_version := v_pub.schema_version;
  protocol_version := v_pub.protocol_version;
  required_compatibility_version := v_pub.required_compatibility_version;
  message := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.host_pull_access_config(text, text, text, bigint, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.host_pull_access_config(text, text, text, bigint, bigint) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileged host acknowledgement (service role only).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.host_ack_access_config(
  p_tenant_id text,
  p_device_id text,
  p_installation_id text,
  p_credential_version bigint,
  p_revision bigint,
  p_publication_id text,
  p_payload_hash text,
  p_result text,
  p_applied_at timestamptz,
  p_error_code text,
  p_message text
)
RETURNS TABLE (
  accepted boolean,
  published_revision bigint,
  last_acknowledged_revision bigint,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device public.tenant_devices%ROWTYPE;
  v_pub public.cloud_config_publications%ROWTYPE;
  v_existing public.cloud_config_host_acks%ROWTYPE;
  v_latest_ack bigint;
  v_max_pub bigint;
BEGIN
  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id AND d.device_id = p_device_id
  FOR SHARE;

  IF NOT FOUND
     OR v_device.role <> 'host'
     OR v_device.enrollment_state <> 'activated'
     OR v_device.installation_id IS DISTINCT FROM p_installation_id
     OR v_device.credential_version IS DISTINCT FROM p_credential_version THEN
    accepted := false;
    message := 'Host is not authorized to acknowledge configuration.';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_pub
  FROM public.cloud_config_publications c
  WHERE c.tenant_id = p_tenant_id
    AND c.domain = 'access'
    AND c.publication_id = p_publication_id
  FOR SHARE;

  IF NOT FOUND THEN
    accepted := false;
    message := 'Publication was not found.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_pub.revision <> p_revision OR v_pub.payload_hash <> p_payload_hash THEN
    accepted := false;
    message := 'Acknowledgement does not match the published revision.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_result NOT IN ('applied', 'already_applied', 'rejected', 'blocked') THEN
    accepted := false;
    message := 'Invalid application result.';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT max(a.applied_revision) INTO v_latest_ack
  FROM public.cloud_config_host_acks a
  WHERE a.tenant_id = p_tenant_id
    AND a.domain = 'access'
    AND a.host_device_id = p_device_id
    AND a.result IN ('applied', 'already_applied');

  -- Late acks must not overwrite newer successful progress.
  IF p_result IN ('applied', 'already_applied')
     AND v_latest_ack IS NOT NULL
     AND p_revision < v_latest_ack THEN
    accepted := true;
    published_revision := (SELECT max(c.revision) FROM public.cloud_config_publications c WHERE c.tenant_id = p_tenant_id AND c.domain = 'access');
    last_acknowledged_revision := v_latest_ack;
    message := 'Late acknowledgement ignored; newer applied revision retained.';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.cloud_config_host_acks a
  WHERE a.tenant_id = p_tenant_id
    AND a.domain = 'access'
    AND a.host_device_id = p_device_id
    AND a.publication_id = p_publication_id
    AND a.result = p_result
  FOR UPDATE;

  IF FOUND THEN
    accepted := true;
  ELSE
    INSERT INTO public.cloud_config_host_acks (
      id,
      tenant_id,
      stall_id,
      domain,
      host_device_id,
      installation_id,
      publication_id,
      published_revision,
      applied_revision,
      payload_hash,
      result,
      host_reported_applied_at,
      server_receipt_at,
      error_code,
      message
    ) VALUES (
      public.polivo_new_id('ack_'),
      p_tenant_id,
      p_tenant_id,
      'access',
      p_device_id,
      p_installation_id,
      p_publication_id,
      p_revision,
      p_revision,
      p_payload_hash,
      p_result,
      p_applied_at,
      now(),
      p_error_code,
      p_message
    );
    accepted := true;
  END IF;

  SELECT max(c.revision) INTO v_max_pub
  FROM public.cloud_config_publications c
  WHERE c.tenant_id = p_tenant_id AND c.domain = 'access';

  SELECT max(a.applied_revision) INTO v_latest_ack
  FROM public.cloud_config_host_acks a
  WHERE a.tenant_id = p_tenant_id
    AND a.domain = 'access'
    AND a.host_device_id = p_device_id
    AND a.result IN ('applied', 'already_applied');

  published_revision := v_max_pub;
  last_acknowledged_revision := v_latest_ack;
  message := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.host_ack_access_config(text, text, text, bigint, bigint, text, text, text, timestamptz, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.host_ack_access_config(text, text, text, bigint, bigint, text, text, text, timestamptz, text, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wire publication into owner mutations.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_permission_profile(text, text, jsonb, bigint);

CREATE OR REPLACE FUNCTION public.update_permission_profile(
  p_tenant_id text,
  p_profile_role text,
  p_capabilities jsonb,
  p_expected_revision bigint
)
RETURNS TABLE (revision bigint, published_revision bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_row public.tenant_permission_profiles%ROWTYPE;
  v_new_revision bigint;
  v_pub record;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF p_profile_role NOT IN ('billing_staff', 'cashier') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.polivo_capabilities_are_known(COALESCE(p_capabilities, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'UNKNOWN_CAPABILITY' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row
  FROM public.tenant_permission_profiles AS p
  WHERE p.tenant_id = p_tenant_id AND p.profile_role = p_profile_role
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'REVISION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  v_new_revision := v_row.revision + 1;

  UPDATE public.tenant_permission_profiles
  SET
    capabilities = COALESCE(p_capabilities, '[]'::jsonb),
    revision = v_new_revision,
    updated_at = now(),
    updated_by_subject = v_actor
  WHERE tenant_id = p_tenant_id AND profile_role = p_profile_role;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'permission_profile.updated',
    'permission_profile',
    p_profile_role,
    jsonb_build_object('capabilities', v_row.capabilities, 'revision', v_row.revision),
    jsonb_build_object('capabilities', COALESCE(p_capabilities, '[]'::jsonb), 'revision', v_new_revision),
    v_new_revision
  );

  SELECT * INTO v_pub FROM public.polivo_publish_access_config(p_tenant_id, v_actor);

  revision := v_new_revision;
  published_revision := v_pub.revision;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.update_permission_profile(text, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_permission_profile(text, text, jsonb, bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_permission_profile(text, text, jsonb, bigint) FROM anon;

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

  IF v_bump_revision THEN
    PERFORM public.polivo_publish_access_config(p_tenant_id, v_actor);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_membership_access(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_membership_access(text, text, text, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_membership_access(text, text, text, text, jsonb) FROM anon;

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
    jsonb_build_object('enrollment_state', v_device.enrollment_state, 'state_revision', v_device.state_revision),
    jsonb_build_object('enrollment_state', 'revoked', 'state_revision', v_rev),
    v_rev
  );

  PERFORM public.polivo_publish_access_config(p_tenant_id, v_actor);

  state_revision := v_rev;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_tenant_device(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_device(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_tenant_device(text, text) FROM anon;
