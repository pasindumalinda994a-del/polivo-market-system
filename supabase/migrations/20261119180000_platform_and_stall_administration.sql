-- Phase 36: platform administrators, stall profile revision, directory RPCs,
-- and platform-scoped admin audit visibility.
-- Do NOT grant platform authority to existing users in this migration.

-- ---------------------------------------------------------------------------
-- Trusted platform administrator store (Clerk subject only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_administrators (
  identity_provider TEXT NOT NULL CHECK (identity_provider IN ('clerk')),
  external_subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_subject TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  PRIMARY KEY (identity_provider, external_subject),
  CONSTRAINT platform_administrators_subject_len CHECK (
    char_length(external_subject) BETWEEN 1 AND 128
  ),
  CONSTRAINT platform_administrators_notes_len CHECK (
    notes IS NULL OR char_length(notes) <= 512
  )
);

ALTER TABLE public.platform_administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_administrators FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_administrators FROM PUBLIC, anon, authenticated;

CREATE POLICY platform_administrators_no_direct_access
  ON public.platform_administrators
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Restricted admin notes (not exposed via ordinary tenants SELECT)
CREATE TABLE IF NOT EXISTS public.tenant_admin_notes (
  tenant_id TEXT PRIMARY KEY REFERENCES public.tenants (id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_subject TEXT NOT NULL,
  CONSTRAINT tenant_admin_notes_len CHECK (char_length(notes) <= 2000)
);

ALTER TABLE public.tenant_admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_admin_notes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_admin_notes FROM PUBLIC, anon, authenticated;

CREATE POLICY tenant_admin_notes_no_direct_access
  ON public.tenant_admin_notes
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Stall profile revision (cloud-owned fields)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS profile_revision BIGINT NOT NULL DEFAULT 1
    CHECK (profile_revision >= 1);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_administrator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_administrators AS p
    WHERE p.identity_provider = 'clerk'
      AND p.external_subject = (SELECT auth.jwt() ->> 'sub')
      AND p.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_administrator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_administrator() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_administrator() FROM anon;

CREATE OR REPLACE FUNCTION public.can_administer_stall_profile(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_administrator()
    OR public.is_active_tenant_owner(p_tenant_id);
$$;

REVOKE ALL ON FUNCTION public.can_administer_stall_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_administer_stall_profile(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_administer_stall_profile(text) FROM anon;

-- ---------------------------------------------------------------------------
-- Audit: platform administrators may SELECT all; owners keep tenant scope
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS admin_audit_events_select_owner ON public.admin_audit_events;
CREATE POLICY admin_audit_events_select_owner
  ON public.admin_audit_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_tenant_owner(tenant_id)
    OR public.is_platform_administrator()
  );

-- ---------------------------------------------------------------------------
-- RPC: current caller platform-admin check (for web gating)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_platform_admin_status()
RETURNS TABLE (
  is_platform_admin boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  is_platform_admin := public.is_platform_administrator();
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_admin_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_admin_status() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_admin_status() FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: get stall profile (owner or platform admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_stall_admin_profile(p_tenant_id text)
RETURNS TABLE (
  tenant_id text,
  status text,
  display_name text,
  market_location text,
  contact text,
  timezone text,
  profile_revision bigint,
  admin_notes text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_notes text;
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  IF NOT public.can_administer_stall_profile(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT n.notes INTO v_notes
  FROM public.tenant_admin_notes AS n
  WHERE n.tenant_id = p_tenant_id;

  tenant_id := v_tenant.id;
  status := v_tenant.status;
  display_name := v_tenant.display_name;
  market_location := v_tenant.market_location;
  contact := v_tenant.contact;
  timezone := v_tenant.timezone;
  profile_revision := v_tenant.profile_revision;
  admin_notes := COALESCE(v_notes, '');
  updated_at := v_tenant.updated_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stall_admin_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stall_admin_profile(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_stall_admin_profile(text) FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: update stall profile (revision-guarded; no status/lifecycle mutation)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_stall_profile(
  p_tenant_id text,
  p_expected_revision bigint,
  p_display_name text,
  p_timezone text,
  p_market_location text DEFAULT NULL,
  p_contact text DEFAULT NULL,
  p_admin_notes text DEFAULT NULL
)
RETURNS TABLE (
  profile_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_tenant public.tenants%ROWTYPE;
  v_new_revision bigint;
  v_display text;
  v_timezone text;
  v_market text;
  v_contact text;
  v_notes text;
  v_before_notes text;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.can_administer_stall_profile(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  v_display := trim(COALESCE(p_display_name, ''));
  v_timezone := trim(COALESCE(p_timezone, ''));
  v_market := NULLIF(trim(COALESCE(p_market_location, '')), '');
  v_contact := NULLIF(trim(COALESCE(p_contact, '')), '');
  v_notes := COALESCE(p_admin_notes, '');

  IF char_length(v_display) < 1 OR char_length(v_display) > 128 THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_NAME' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_timezone) < 1 OR char_length(v_timezone) > 64 THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE' USING ERRCODE = 'P0001';
  END IF;
  IF v_market IS NOT NULL AND char_length(v_market) > 256 THEN
    RAISE EXCEPTION 'INVALID_MARKET_LOCATION' USING ERRCODE = 'P0001';
  END IF;
  IF v_contact IS NOT NULL AND char_length(v_contact) > 256 THEN
    RAISE EXCEPTION 'INVALID_CONTACT' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'INVALID_ADMIN_NOTES' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_tenant.profile_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'REVISION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  SELECT n.notes INTO v_before_notes
  FROM public.tenant_admin_notes AS n
  WHERE n.tenant_id = p_tenant_id;

  v_new_revision := v_tenant.profile_revision + 1;

  UPDATE public.tenants
  SET
    display_name = v_display,
    timezone = v_timezone,
    market_location = v_market,
    contact = v_contact,
    profile_revision = v_new_revision,
    updated_at = now()
  WHERE id = p_tenant_id;

  INSERT INTO public.tenant_admin_notes (tenant_id, notes, updated_at, updated_by_subject)
  VALUES (p_tenant_id, v_notes, now(), v_actor)
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    notes = EXCLUDED.notes,
    updated_at = EXCLUDED.updated_at,
    updated_by_subject = EXCLUDED.updated_by_subject;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'stall_profile.updated',
    'tenant',
    p_tenant_id,
    jsonb_build_object(
      'display_name', v_tenant.display_name,
      'timezone', v_tenant.timezone,
      'market_location', v_tenant.market_location,
      'contact', v_tenant.contact,
      'admin_notes', COALESCE(v_before_notes, ''),
      'profile_revision', v_tenant.profile_revision
    ),
    jsonb_build_object(
      'display_name', v_display,
      'timezone', v_timezone,
      'market_location', v_market,
      'contact', v_contact,
      'admin_notes', v_notes,
      'profile_revision', v_new_revision
    ),
    v_new_revision
  );

  -- Cloud web profile fields do not enter the Phase 33 access snapshot.
  -- Historical bill headers remain unchanged (local snapshots).

  profile_revision := v_new_revision;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.update_stall_profile(text, bigint, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_stall_profile(text, bigint, text, text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_stall_profile(text, bigint, text, text, text, text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: platform stall directory (operational metadata only; no financials)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_platform_stall_directory(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_tenant_id text DEFAULT NULL
)
RETURNS TABLE (
  tenant_id text,
  display_name text,
  market_location text,
  contact text,
  timezone text,
  status text,
  owner_subject text,
  enrollment_status text,
  last_host_contact_at timestamptz,
  last_upload_applied_at timestamptz,
  config_published_revision bigint,
  config_acknowledged_revision bigint,
  config_delivery_status text,
  blocker_no_enrolled_host boolean,
  blocker_host_contact_stale boolean,
  blocker_upload_blocked boolean,
  blocker_config_pending boolean,
  blocker_reconciliation_issue boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  v_offset integer;
  v_search text;
  v_stale_interval interval := interval '48 hours';
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  IF NOT public.is_platform_administrator() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));
  v_search := NULLIF(trim(COALESCE(p_search, '')), '');

  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'INVALID_STATUS_FILTER' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH owners AS (
    SELECT DISTINCT ON (m.tenant_id)
      m.tenant_id,
      m.external_subject AS owner_subject
    FROM public.tenant_memberships m
    WHERE m.status = 'active'
      AND m.access_role = 'owner'
    ORDER BY m.tenant_id, m.created_at ASC
  ),
  hosts AS (
    SELECT DISTINCT ON (d.tenant_id)
      d.tenant_id,
      d.enrollment_state,
      d.updated_at AS host_updated_at
    FROM public.tenant_devices d
    WHERE d.role = 'host'
    ORDER BY d.tenant_id,
      CASE d.enrollment_state
        WHEN 'activated' THEN 1
        WHEN 'redeemed' THEN 2
        WHEN 'reserved' THEN 3
        WHEN 'waiting_host_confirm' THEN 4
        WHEN 'revoked' THEN 5
        ELSE 6
      END,
      d.updated_at DESC
  ),
  streams AS (
    SELECT
      s.tenant_id,
      max(s.updated_at) AS last_host_contact_at
    FROM public.sync_source_streams s
    GROUP BY s.tenant_id
  ),
  uploads AS (
    SELECT
      r.tenant_id,
      max(r.applied_at) AS last_upload_applied_at
    FROM public.sync_transaction_group_receipts r
    GROUP BY r.tenant_id
  ),
  pubs AS (
    SELECT
      c.tenant_id,
      max(c.revision) AS published_revision
    FROM public.cloud_config_publications c
    WHERE c.domain = 'access'
    GROUP BY c.tenant_id
  ),
  acks AS (
    SELECT DISTINCT ON (a.tenant_id)
      a.tenant_id,
      a.applied_revision AS acknowledged_revision,
      a.result AS ack_result
    FROM public.cloud_config_host_acks a
    WHERE a.domain = 'access'
      AND a.result IN ('applied', 'already_applied')
    ORDER BY a.tenant_id, a.applied_revision DESC, a.server_receipt_at DESC
  ),
  base AS (
    SELECT
      t.id AS tenant_id,
      t.display_name,
      t.market_location,
      t.contact,
      t.timezone,
      t.status,
      o.owner_subject,
      CASE
        WHEN h.tenant_id IS NULL THEN 'no_enrolled_host'
        WHEN h.enrollment_state = 'activated' THEN 'host_activated'
        WHEN h.enrollment_state = 'revoked' THEN 'host_revoked'
        ELSE 'host_' || h.enrollment_state
      END AS enrollment_status,
      st.last_host_contact_at,
      up.last_upload_applied_at,
      pb.published_revision AS config_published_revision,
      ak.acknowledged_revision AS config_acknowledged_revision,
      CASE
        WHEN pb.published_revision IS NULL THEN 'none_published'
        WHEN ak.acknowledged_revision IS NULL OR ak.acknowledged_revision < pb.published_revision
          THEN 'pending_delivery'
        ELSE 'applied'
      END AS config_delivery_status,
      (h.tenant_id IS NULL OR h.enrollment_state <> 'activated') AS blocker_no_enrolled_host,
      (
        h.enrollment_state = 'activated'
        AND (
          st.last_host_contact_at IS NULL
          OR st.last_host_contact_at < (now() - v_stale_interval)
        )
      ) AS blocker_host_contact_stale,
      false AS blocker_upload_blocked,
      (
        pb.published_revision IS NOT NULL
        AND (
          ak.acknowledged_revision IS NULL
          OR ak.acknowledged_revision < pb.published_revision
        )
      ) AS blocker_config_pending,
      false AS blocker_reconciliation_issue
    FROM public.tenants t
    LEFT JOIN owners o ON o.tenant_id = t.id
    LEFT JOIN hosts h ON h.tenant_id = t.id
    LEFT JOIN streams st ON st.tenant_id = t.id
    LEFT JOIN uploads up ON up.tenant_id = t.id
    LEFT JOIN pubs pb ON pb.tenant_id = t.id
    LEFT JOIN acks ak ON ak.tenant_id = t.id
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
      AND (p_status IS NULL OR t.status = p_status)
      AND (
        v_search IS NULL
        OR t.id ILIKE '%' || v_search || '%'
        OR t.display_name ILIKE '%' || v_search || '%'
        OR COALESCE(t.market_location, '') ILIKE '%' || v_search || '%'
        OR COALESCE(t.contact, '') ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT b.*, count(*) OVER () AS total_count
    FROM base b
  )
  SELECT
    c.tenant_id,
    c.display_name,
    c.market_location,
    c.contact,
    c.timezone,
    c.status,
    c.owner_subject,
    c.enrollment_status,
    c.last_host_contact_at,
    c.last_upload_applied_at,
    c.config_published_revision,
    c.config_acknowledged_revision,
    c.config_delivery_status,
    c.blocker_no_enrolled_host,
    c.blocker_host_contact_stale,
    c.blocker_upload_blocked,
    c.blocker_config_pending,
    c.blocker_reconciliation_issue,
    c.total_count
  FROM counted c
  ORDER BY c.display_name ASC, c.tenant_id ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.list_platform_stall_directory(integer, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_platform_stall_directory(integer, integer, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_platform_stall_directory(integer, integer, text, text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: platform-scoped stall operational detail (no financial totals)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_platform_stall_detail(p_tenant_id text)
RETURNS TABLE (
  tenant_id text,
  display_name text,
  market_location text,
  contact text,
  timezone text,
  status text,
  profile_revision bigint,
  admin_notes text,
  owner_subject text,
  enrollment_status text,
  last_host_contact_at timestamptz,
  last_upload_applied_at timestamptz,
  config_published_revision bigint,
  config_acknowledged_revision bigint,
  config_delivery_status text,
  blocker_no_enrolled_host boolean,
  blocker_host_contact_stale boolean,
  blocker_upload_blocked boolean,
  blocker_config_pending boolean,
  blocker_reconciliation_issue boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dir record;
  v_tenant public.tenants%ROWTYPE;
  v_notes text;
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  IF NOT public.is_platform_administrator() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT n.notes INTO v_notes
  FROM public.tenant_admin_notes AS n
  WHERE n.tenant_id = p_tenant_id;

  SELECT d.*
  INTO v_dir
  FROM public.list_platform_stall_directory(1, 0, NULL, NULL, p_tenant_id) AS d
  LIMIT 1;

  tenant_id := v_tenant.id;
  display_name := v_tenant.display_name;
  market_location := v_tenant.market_location;
  contact := v_tenant.contact;
  timezone := v_tenant.timezone;
  status := v_tenant.status;
  profile_revision := v_tenant.profile_revision;
  admin_notes := COALESCE(v_notes, '');
  owner_subject := v_dir.owner_subject;
  enrollment_status := COALESCE(v_dir.enrollment_status, 'no_enrolled_host');
  last_host_contact_at := v_dir.last_host_contact_at;
  last_upload_applied_at := v_dir.last_upload_applied_at;
  config_published_revision := v_dir.config_published_revision;
  config_acknowledged_revision := v_dir.config_acknowledged_revision;
  config_delivery_status := COALESCE(v_dir.config_delivery_status, 'none_published');
  blocker_no_enrolled_host := COALESCE(v_dir.blocker_no_enrolled_host, true);
  blocker_host_contact_stale := COALESCE(v_dir.blocker_host_contact_stale, false);
  blocker_upload_blocked := COALESCE(v_dir.blocker_upload_blocked, false);
  blocker_config_pending := COALESCE(v_dir.blocker_config_pending, false);
  blocker_reconciliation_issue := COALESCE(v_dir.blocker_reconciliation_issue, false);
  updated_at := v_tenant.updated_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_stall_detail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_stall_detail(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_stall_detail(text) FROM anon;

-- Allow platform admins to read access delivery status without ownership.
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
  IF NOT (
    public.is_active_tenant_owner(p_tenant_id)
    OR public.is_platform_administrator()
  ) THEN
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
