-- Phase 11: grants and row-level security for Data API exposure.
-- authenticated: reporting SELECT via active membership only.
-- No authenticated INSERT/UPDATE/DELETE on synchronized financial copies.
-- Membership: own-row SELECT only; no self-mutation policies.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.tenants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.farmers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.traders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vegetables FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_band_sets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_bands FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sale_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sale_line_package_weights FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sale_farmer_allocations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trader_bills FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.farmer_bills FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payment_allocations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sync_received_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.tenants TO authenticated;
GRANT SELECT ON TABLE public.tenant_memberships TO authenticated;
GRANT SELECT ON TABLE public.farmers TO authenticated;
GRANT SELECT ON TABLE public.traders TO authenticated;
GRANT SELECT ON TABLE public.vegetables TO authenticated;
GRANT SELECT ON TABLE public.commission_band_sets TO authenticated;
GRANT SELECT ON TABLE public.commission_bands TO authenticated;
GRANT SELECT ON TABLE public.sales TO authenticated;
GRANT SELECT ON TABLE public.sale_lines TO authenticated;
GRANT SELECT ON TABLE public.sale_line_package_weights TO authenticated;
GRANT SELECT ON TABLE public.sale_farmer_allocations TO authenticated;
GRANT SELECT ON TABLE public.trader_bills TO authenticated;
GRANT SELECT ON TABLE public.farmer_bills TO authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;
GRANT SELECT ON TABLE public.payment_allocations TO authenticated;
GRANT SELECT ON TABLE public.audit_events TO authenticated;
GRANT SELECT ON TABLE public.sync_received_events TO authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vegetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_band_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_line_package_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_farmer_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trader_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_received_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.farmers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.traders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vegetables FORCE ROW LEVEL SECURITY;
ALTER TABLE public.commission_band_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.commission_bands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_line_package_weights FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_farmer_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trader_bills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_bills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sync_received_events FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Membership: own-row SELECT only (non-recursive; no helper needed)
-- ---------------------------------------------------------------------------

CREATE POLICY tenant_memberships_select_own
  ON public.tenant_memberships
  FOR SELECT
  TO authenticated
  USING (
    identity_provider = 'clerk'
    AND external_subject = (SELECT auth.jwt() ->> 'sub')
  );

-- ---------------------------------------------------------------------------
-- Tenants and reporting tables: active reporting_reader membership
-- ---------------------------------------------------------------------------

CREATE POLICY tenants_select_member
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(id));

CREATE POLICY farmers_select_member
  ON public.farmers
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY traders_select_member
  ON public.traders
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY vegetables_select_member
  ON public.vegetables
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY commission_band_sets_select_member
  ON public.commission_band_sets
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY commission_bands_select_member
  ON public.commission_bands
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY sales_select_member
  ON public.sales
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY sale_lines_select_member
  ON public.sale_lines
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY sale_line_package_weights_select_member
  ON public.sale_line_package_weights
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY sale_farmer_allocations_select_member
  ON public.sale_farmer_allocations
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY trader_bills_select_member
  ON public.trader_bills
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY farmer_bills_select_member
  ON public.farmer_bills
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY payments_select_member
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY payment_allocations_select_member
  ON public.payment_allocations
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY audit_events_select_member
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY sync_received_events_select_member
  ON public.sync_received_events
  FOR SELECT
  TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

-- No INSERT/UPDATE/DELETE policies for authenticated on any of the above tables.
-- Default denial applies for missing identity, inactive membership, and anon.
