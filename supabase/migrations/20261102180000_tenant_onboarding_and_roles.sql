-- Phase 13: tenant onboarding, operational roles, invitations, permission profiles.
-- Forward-only. Does not modify applied phase 11 migration history.

-- ---------------------------------------------------------------------------
-- Tenant profile columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS market_location TEXT,
  ADD COLUMN IF NOT EXISTS contact TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT;

UPDATE public.tenants
SET
  display_name = COALESCE(NULLIF(trim(display_name), ''), 'Stall'),
  timezone = COALESCE(NULLIF(trim(timezone), ''), 'Asia/Colombo')
WHERE display_name IS NULL OR timezone IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN display_name SET NOT NULL,
  ALTER COLUMN timezone SET NOT NULL;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_display_name_len,
  DROP CONSTRAINT IF EXISTS tenants_timezone_len,
  DROP CONSTRAINT IF EXISTS tenants_market_location_len,
  DROP CONSTRAINT IF EXISTS tenants_contact_len;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_display_name_len CHECK (char_length(display_name) BETWEEN 1 AND 128),
  ADD CONSTRAINT tenants_timezone_len CHECK (char_length(timezone) BETWEEN 1 AND 64),
  ADD CONSTRAINT tenants_market_location_len CHECK (market_location IS NULL OR char_length(market_location) <= 256),
  ADD CONSTRAINT tenants_contact_len CHECK (contact IS NULL OR char_length(contact) <= 256);

-- ---------------------------------------------------------------------------
-- Membership roles and capabilities
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_access_role_check;

UPDATE public.tenant_memberships
SET access_role = 'billing_staff'
WHERE access_role = 'reporting_reader';

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_access_role_check
  CHECK (access_role IN ('owner', 'billing_staff', 'cashier'));

ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_capabilities_is_array;

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_capabilities_is_array
  CHECK (jsonb_typeof(capabilities) = 'array');

-- ---------------------------------------------------------------------------
-- Permission profiles (tenant-level billing_staff / cashier recommendations)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_permission_profiles (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  profile_role TEXT NOT NULL CHECK (profile_role IN ('billing_staff', 'cashier')),
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_subject TEXT NOT NULL,
  PRIMARY KEY (tenant_id, profile_role),
  CONSTRAINT tenant_permission_profiles_capabilities_is_array
    CHECK (jsonb_typeof(capabilities) = 'array')
);

-- ---------------------------------------------------------------------------
-- Invitations (token hash only; raw token never stored)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  email_normalized TEXT NOT NULL,
  access_role TEXT NOT NULL CHECK (access_role IN ('billing_staff', 'cashier')),
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  accepted_by_subject TEXT,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT tenant_invitations_capabilities_is_array
    CHECK (jsonb_typeof(capabilities) = 'array'),
  CONSTRAINT tenant_invitations_email_len CHECK (char_length(email_normalized) BETWEEN 3 AND 320)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_invitations_token_hash_uidx
  ON public.tenant_invitations (token_hash);

CREATE INDEX IF NOT EXISTS tenant_invitations_tenant_status_idx
  ON public.tenant_invitations (tenant_id, status);

-- ---------------------------------------------------------------------------
-- Onboarding idempotency
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_onboarding_requests (
  idempotency_key TEXT PRIMARY KEY,
  actor_subject TEXT NOT NULL,
  request_payload_hash TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_requests_key_len CHECK (char_length(idempotency_key) BETWEEN 1 AND 128)
);

CREATE INDEX IF NOT EXISTS tenant_onboarding_requests_actor_idx
  ON public.tenant_onboarding_requests (actor_subject);

-- ---------------------------------------------------------------------------
-- Administrative audit (cloud membership/permission changes)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  actor_subject TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  before_json JSONB,
  after_json JSONB,
  configuration_revision BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_events_action_len CHECK (char_length(action) BETWEEN 1 AND 128)
);

CREATE INDEX IF NOT EXISTS admin_audit_events_tenant_created_idx
  ON public.admin_audit_events (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_tenant_owner(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.identity_provider = 'clerk'
      AND m.external_subject = (SELECT auth.jwt() ->> 'sub')
      AND m.status = 'active'
      AND m.access_role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_tenant_owner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_tenant_owner(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_active_tenant_owner(text) FROM anon;

CREATE OR REPLACE FUNCTION public.has_active_reporting_access(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.identity_provider = 'clerk'
      AND m.external_subject = (SELECT auth.jwt() ->> 'sub')
      AND m.status = 'active'
      AND m.access_role IN ('owner', 'billing_staff', 'cashier')
  );
$$;

CREATE OR REPLACE FUNCTION public.polivo_normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(trim(p_email));
$$;

CREATE OR REPLACE FUNCTION public.polivo_capabilities_are_known(p_capabilities jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    jsonb_typeof(p_capabilities) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_capabilities) AS c(value)
      WHERE c.value NOT IN (
        'bills.create',
        'bills.edit_draft',
        'bills.finalize',
        'bills.change_selling_price',
        'bills.change_commission',
        'bills.add_change_deductions',
        'bills.correct_finalized',
        'bills.cancel_finalized',
        'payments.receive_trader',
        'payments.pay_farmer',
        'payments.record_cheque',
        'payments.reverse',
        'reports.view_financial',
        'parties.register_edit',
        'inventory.manage_arrivals',
        'inventory.adjust',
        'data.export',
        'staff.manage',
        'settings.manage',
        'backups.restore'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.polivo_new_id(p_prefix text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  RETURN p_prefix || replace(gen_random_uuid()::text, '-', '');
END;
$$;

CREATE OR REPLACE FUNCTION public.polivo_require_clerk_sub()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_sub text;
BEGIN
  v_sub := NULLIF(trim(COALESCE(auth.jwt() ->> 'sub', '')), '');
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_sub;
END;
$$;

CREATE OR REPLACE FUNCTION public.polivo_jwt_verified_email()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_verified text;
BEGIN
  v_email := public.polivo_normalize_email(COALESCE(auth.jwt() ->> 'email', ''));
  v_verified := lower(COALESCE(auth.jwt() ->> 'email_verified', auth.jwt() ->> 'emailVerified', 'false'));
  IF v_email = '' OR v_verified NOT IN ('true', 't', '1') THEN
    RAISE EXCEPTION 'EMAIL_NOT_VERIFIED' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.polivo_write_admin_audit(
  p_id text,
  p_tenant_id text,
  p_actor_subject text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_before jsonb,
  p_after jsonb,
  p_revision bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.admin_audit_events (
    id, tenant_id, actor_subject, action, target_type, target_id,
    before_json, after_json, configuration_revision, created_at
  ) VALUES (
    p_id, p_tenant_id, p_actor_subject, p_action, p_target_type, p_target_id,
    p_before, p_after, p_revision, now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.polivo_write_admin_audit(text, text, text, text, text, text, jsonb, jsonb, bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- RPC: create stall with owner (atomic + idempotent)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_stall_with_owner(
  p_idempotency_key text,
  p_request_payload_hash text,
  p_display_name text,
  p_timezone text,
  p_market_location text DEFAULT NULL,
  p_contact text DEFAULT NULL,
  p_billing_staff_capabilities jsonb DEFAULT '[]'::jsonb,
  p_cashier_capabilities jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (tenant_id text, membership_id text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_tenant_id text;
  v_membership_id text;
  v_existing public.tenant_onboarding_requests%ROWTYPE;
  v_display text;
  v_timezone text;
  v_market text;
  v_contact text;
BEGIN
  v_actor := public.polivo_require_clerk_sub();

  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) < 1 OR char_length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = 'P0001';
  END IF;
  IF p_request_payload_hash IS NULL OR char_length(trim(p_request_payload_hash)) < 1 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD_HASH' USING ERRCODE = 'P0001';
  END IF;

  v_display := trim(COALESCE(p_display_name, ''));
  v_timezone := trim(COALESCE(p_timezone, ''));
  v_market := NULLIF(trim(COALESCE(p_market_location, '')), '');
  v_contact := NULLIF(trim(COALESCE(p_contact, '')), '');

  IF char_length(v_display) < 1 OR char_length(v_display) > 128 THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_NAME' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_timezone) < 1 OR char_length(v_timezone) > 64 THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.polivo_capabilities_are_known(COALESCE(p_billing_staff_capabilities, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'UNKNOWN_CAPABILITY' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.polivo_capabilities_are_known(COALESCE(p_cashier_capabilities, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'UNKNOWN_CAPABILITY' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM public.tenant_onboarding_requests AS r
  WHERE r.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.actor_subject <> v_actor OR v_existing.request_payload_hash <> p_request_payload_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    SELECT m.id INTO v_membership_id
    FROM public.tenant_memberships AS m
    WHERE m.tenant_id = v_existing.tenant_id
      AND m.identity_provider = 'clerk'
      AND m.external_subject = v_actor
      AND m.access_role = 'owner'
    LIMIT 1;
    tenant_id := v_existing.tenant_id;
    membership_id := COALESCE(v_membership_id, '');
    replayed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_tenant_id := public.polivo_new_id('ten_');
  v_membership_id := public.polivo_new_id('mem_');

  INSERT INTO public.tenants (
    id, status, display_name, market_location, contact, timezone, created_at, updated_at
  ) VALUES (
    v_tenant_id, 'active', v_display, v_market, v_contact, v_timezone, now(), now()
  );

  INSERT INTO public.tenant_memberships (
    id, tenant_id, identity_provider, external_subject, status, access_role, capabilities, created_at, updated_at
  ) VALUES (
    v_membership_id, v_tenant_id, 'clerk', v_actor, 'active', 'owner', '[]'::jsonb, now(), now()
  );

  INSERT INTO public.tenant_permission_profiles (
    tenant_id, profile_role, capabilities, revision, updated_at, updated_by_subject
  ) VALUES
    (v_tenant_id, 'billing_staff', COALESCE(p_billing_staff_capabilities, '[]'::jsonb), 1, now(), v_actor),
    (v_tenant_id, 'cashier', COALESCE(p_cashier_capabilities, '[]'::jsonb), 1, now(), v_actor);

  INSERT INTO public.tenant_onboarding_requests (
    idempotency_key, actor_subject, request_payload_hash, tenant_id, created_at
  ) VALUES (
    p_idempotency_key, v_actor, p_request_payload_hash, v_tenant_id, now()
  );

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    v_tenant_id,
    v_actor,
    'tenant.created',
    'tenant',
    v_tenant_id,
    NULL,
    jsonb_build_object(
      'display_name', v_display,
      'timezone', v_timezone,
      'membership_id', v_membership_id
    ),
    NULL
  );

  tenant_id := v_tenant_id;
  membership_id := v_membership_id;
  replayed := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_stall_with_owner(text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stall_with_owner(text, text, text, text, text, text, jsonb, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_stall_with_owner(text, text, text, text, text, text, jsonb, jsonb) FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: create invitation (owner-only; caller supplies token_hash)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_tenant_invitation(
  p_tenant_id text,
  p_email text,
  p_access_role text,
  p_capabilities jsonb,
  p_token_hash text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (invitation_id text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_email text;
  v_id text;
  v_expires timestamptz;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  v_email := public.polivo_normalize_email(COALESCE(p_email, ''));
  IF char_length(v_email) < 3 OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE = 'P0001';
  END IF;
  IF p_access_role NOT IN ('billing_staff', 'cashier') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.polivo_capabilities_are_known(COALESCE(p_capabilities, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'UNKNOWN_CAPABILITY' USING ERRCODE = 'P0001';
  END IF;
  IF p_token_hash IS NULL OR char_length(trim(p_token_hash)) < 32 THEN
    RAISE EXCEPTION 'INVALID_TOKEN_HASH' USING ERRCODE = 'P0001';
  END IF;

  v_expires := COALESCE(p_expires_at, now() + interval '7 days');
  IF v_expires <= now() THEN
    RAISE EXCEPTION 'INVALID_EXPIRY' USING ERRCODE = 'P0001';
  END IF;

  v_id := public.polivo_new_id('inv_');

  INSERT INTO public.tenant_invitations (
    id, tenant_id, email_normalized, access_role, capabilities, token_hash,
    status, expires_at, created_by_subject, created_at
  ) VALUES (
    v_id, p_tenant_id, v_email, p_access_role, COALESCE(p_capabilities, '[]'::jsonb), trim(p_token_hash),
    'pending', v_expires, v_actor, now()
  );

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'invitation.created',
    'invitation',
    v_id,
    NULL,
    jsonb_build_object(
      'email_normalized', v_email,
      'access_role', p_access_role,
      'expires_at', v_expires
    ),
    NULL
  );

  invitation_id := v_id;
  expires_at := v_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_invitation(text, text, text, jsonb, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant_invitation(text, text, text, jsonb, text, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_tenant_invitation(text, text, text, jsonb, text, timestamptz) FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: revoke invitation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_tenant_invitation(
  p_tenant_id text,
  p_invitation_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_row public.tenant_invitations%ROWTYPE;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row
  FROM public.tenant_invitations AS i
  WHERE i.id = p_invitation_id AND i.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITATION_NOT_PENDING' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tenant_invitations
  SET status = 'revoked', revoked_at = now()
  WHERE id = p_invitation_id;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'invitation.revoked',
    'invitation',
    p_invitation_id,
    jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', 'revoked'),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_tenant_invitation(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_invitation(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_tenant_invitation(text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: accept invitation (atomic, email-bound)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(
  p_token_hash text
)
RETURNS TABLE (tenant_id text, membership_id text, access_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_email text;
  v_inv public.tenant_invitations%ROWTYPE;
  v_existing public.tenant_memberships%ROWTYPE;
  v_membership_id text;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  v_email := public.polivo_jwt_verified_email();

  IF p_token_hash IS NULL OR char_length(trim(p_token_hash)) < 32 THEN
    RAISE EXCEPTION 'INVALID_TOKEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_inv
  FROM public.tenant_invitations AS i
  WHERE i.token_hash = trim(p_token_hash)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_TOKEN' USING ERRCODE = 'P0001';
  END IF;

  IF v_inv.status = 'accepted' AND v_inv.accepted_by_subject = v_actor THEN
    SELECT m.id, m.access_role INTO v_membership_id, access_role
    FROM public.tenant_memberships AS m
    WHERE m.tenant_id = v_inv.tenant_id
      AND m.identity_provider = 'clerk'
      AND m.external_subject = v_actor
    LIMIT 1;
    tenant_id := v_inv.tenant_id;
    membership_id := COALESCE(v_membership_id, '');
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_TOKEN' USING ERRCODE = 'P0001';
  END IF;

  IF v_inv.expires_at <= now() THEN
    UPDATE public.tenant_invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'INVALID_TOKEN' USING ERRCODE = 'P0001';
  END IF;

  IF v_inv.email_normalized <> v_email THEN
    RAISE EXCEPTION 'INVALID_TOKEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM public.tenant_memberships AS m
  WHERE m.tenant_id = v_inv.tenant_id
    AND m.identity_provider = 'clerk'
    AND m.external_subject = v_actor
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status <> 'active' THEN
      -- Do not reactivate previously removed members via invitation.
      RAISE EXCEPTION 'MEMBERSHIP_INACTIVE' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'ALREADY_MEMBER' USING ERRCODE = 'P0001';
  END IF;

  v_membership_id := public.polivo_new_id('mem_');

  INSERT INTO public.tenant_memberships (
    id, tenant_id, identity_provider, external_subject, status, access_role, capabilities, created_at, updated_at
  ) VALUES (
    v_membership_id, v_inv.tenant_id, 'clerk', v_actor, 'active', v_inv.access_role, v_inv.capabilities, now(), now()
  );

  UPDATE public.tenant_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by_subject = v_actor
  WHERE id = v_inv.id;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    v_inv.tenant_id,
    v_actor,
    'invitation.accepted',
    'invitation',
    v_inv.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'accepted', 'membership_id', v_membership_id, 'access_role', v_inv.access_role),
    NULL
  );

  tenant_id := v_inv.tenant_id;
  membership_id := v_membership_id;
  access_role := v_inv.access_role;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_tenant_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_tenant_invitation(text) FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: update membership access (owner-only; last-owner guard)
-- ---------------------------------------------------------------------------

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
  -- Ownership transfer is unavailable: cannot promote to owner or demote another owner to non-owner.
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

  UPDATE public.tenant_memberships
  SET
    status = v_new_status,
    access_role = v_new_role,
    capabilities = CASE WHEN v_new_role = 'owner' THEN '[]'::jsonb ELSE v_new_caps END,
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
      'capabilities', v_row.capabilities
    ),
    jsonb_build_object(
      'status', v_new_status,
      'access_role', v_new_role,
      'capabilities', CASE WHEN v_new_role = 'owner' THEN '[]'::jsonb ELSE v_new_caps END
    ),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_membership_access(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_membership_access(text, text, text, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_membership_access(text, text, text, text, jsonb) FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: update permission profile (revision-guarded)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_permission_profile(
  p_tenant_id text,
  p_profile_role text,
  p_capabilities jsonb,
  p_expected_revision bigint
)
RETURNS TABLE (revision bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_row public.tenant_permission_profiles%ROWTYPE;
  v_new_revision bigint;
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

  revision := v_new_revision;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.update_permission_profile(text, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_permission_profile(text, text, jsonb, bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_permission_profile(text, text, jsonb, bigint) FROM anon;

-- ---------------------------------------------------------------------------
-- Grants and RLS for new tables
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.tenant_permission_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_invitations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_onboarding_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.admin_audit_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.tenant_permission_profiles TO authenticated;
GRANT SELECT ON TABLE public.tenant_invitations TO authenticated;
GRANT SELECT ON TABLE public.admin_audit_events TO authenticated;
-- onboarding_requests: no authenticated SELECT (RPC-only)

ALTER TABLE public.tenant_permission_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_onboarding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_permission_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_onboarding_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_memberships_select_own ON public.tenant_memberships;
CREATE POLICY tenant_memberships_select_own
  ON public.tenant_memberships
  FOR SELECT
  TO authenticated
  USING (
    (
      identity_provider = 'clerk'
      AND external_subject = (SELECT auth.jwt() ->> 'sub')
    )
    OR public.is_active_tenant_owner(tenant_id)
  );

DROP POLICY IF EXISTS tenant_permission_profiles_select_owner ON public.tenant_permission_profiles;
CREATE POLICY tenant_permission_profiles_select_owner
  ON public.tenant_permission_profiles
  FOR SELECT
  TO authenticated
  USING (public.is_active_tenant_owner(tenant_id));

DROP POLICY IF EXISTS tenant_invitations_select_owner ON public.tenant_invitations;
CREATE POLICY tenant_invitations_select_owner
  ON public.tenant_invitations
  FOR SELECT
  TO authenticated
  USING (public.is_active_tenant_owner(tenant_id));

DROP POLICY IF EXISTS admin_audit_events_select_owner ON public.admin_audit_events;
CREATE POLICY admin_audit_events_select_owner
  ON public.admin_audit_events
  FOR SELECT
  TO authenticated
  USING (public.is_active_tenant_owner(tenant_id));

-- No SELECT policy on tenant_onboarding_requests for authenticated: deny by default.
