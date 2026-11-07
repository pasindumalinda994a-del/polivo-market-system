-- PostgREST matches RPC args by name + Postgres type. JS arrays in supabase-js
-- are sent as JSON and often fail to match jsonb parameters (PGRST202).
-- Accept json for capability seeds; cast to jsonb inside for storage/helpers.

DROP FUNCTION IF EXISTS public.create_stall_with_owner(text, text, text, text, text, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.create_stall_with_owner(
  p_idempotency_key text,
  p_request_payload_hash text,
  p_display_name text,
  p_timezone text,
  p_market_location text DEFAULT NULL,
  p_contact text DEFAULT NULL,
  p_billing_staff_capabilities json DEFAULT '[]'::json,
  p_cashier_capabilities json DEFAULT '[]'::json
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
  v_billing_caps jsonb;
  v_cashier_caps jsonb;
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
  v_billing_caps := COALESCE(p_billing_staff_capabilities::jsonb, '[]'::jsonb);
  v_cashier_caps := COALESCE(p_cashier_capabilities::jsonb, '[]'::jsonb);

  IF char_length(v_display) < 1 OR char_length(v_display) > 128 THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_NAME' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_timezone) < 1 OR char_length(v_timezone) > 64 THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.polivo_capabilities_are_known(v_billing_caps) THEN
    RAISE EXCEPTION 'UNKNOWN_CAPABILITY' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.polivo_capabilities_are_known(v_cashier_caps) THEN
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
    (v_tenant_id, 'billing_staff', v_billing_caps, 1, now(), v_actor),
    (v_tenant_id, 'cashier', v_cashier_caps, 1, now(), v_actor);

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

REVOKE ALL ON FUNCTION public.create_stall_with_owner(text, text, text, text, text, text, json, json) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stall_with_owner(text, text, text, text, text, text, json, json) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_stall_with_owner(text, text, text, text, text, text, json, json) FROM anon;

NOTIFY pgrst, 'reload schema';
