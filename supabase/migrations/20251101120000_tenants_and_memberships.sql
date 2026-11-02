-- Phase 11: minimal tenant and membership structures for isolation.
-- Clerk subjects are opaque TEXT. Do not cast to UUID.

CREATE TABLE public.tenants (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  identity_provider TEXT NOT NULL CHECK (identity_provider IN ('clerk')),
  external_subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended')),
  access_role TEXT NOT NULL CHECK (access_role IN ('reporting_reader')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, identity_provider, external_subject)
);

CREATE INDEX tenant_memberships_subject_idx
  ON public.tenant_memberships (identity_provider, external_subject);

-- Narrow SECURITY DEFINER helper for RLS. Fixed search_path; fully qualified refs.
-- Derives identity from verified request JWT claims (auth.jwt()->>'sub').
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
      AND m.access_role = 'reporting_reader'
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_reporting_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_reporting_access(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_reporting_access(text) FROM anon;
