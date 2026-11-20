-- Phase 33 follow-up: owner Permission saves must update memberships that Phase 33
-- delivers to the stall host. Local apply reads membership.capabilities only.
-- Keep in sync with packages/domain permission semantics: profile roles are
-- billing_staff | cashier; owners are never overwritten by this cascade.

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
  v_caps jsonb;
  v_pub record;
BEGIN
  v_actor := public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF p_profile_role NOT IN ('billing_staff', 'cashier') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = 'P0001';
  END IF;

  v_caps := COALESCE(p_capabilities, '[]'::jsonb);
  IF NOT public.polivo_capabilities_are_known(v_caps) THEN
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
    capabilities = v_caps,
    revision = v_new_revision,
    updated_at = now(),
    updated_by_subject = v_actor
  WHERE tenant_id = p_tenant_id AND profile_role = p_profile_role;

  -- Cascade to all memberships with this operational role so Phase 33 snapshots
  -- carry the same capabilities the owner just saved on Permissions.
  UPDATE public.tenant_memberships
  SET
    capabilities = v_caps,
    capabilities_revision = capabilities_revision + 1,
    updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND access_role = p_profile_role;

  PERFORM public.polivo_write_admin_audit(
    public.polivo_new_id('aud_'),
    p_tenant_id,
    v_actor,
    'permission_profile.updated',
    'permission_profile',
    p_profile_role,
    jsonb_build_object('capabilities', v_row.capabilities, 'revision', v_row.revision),
    jsonb_build_object('capabilities', v_caps, 'revision', v_new_revision),
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
