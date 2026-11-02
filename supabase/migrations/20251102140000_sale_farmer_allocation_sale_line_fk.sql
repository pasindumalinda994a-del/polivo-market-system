-- CR-04 (PR #4): enforce that sale_farmer_allocations.sale_line_id belongs to the same sale.
-- Forward migration; do not rewrite 20251101120100_reporting_core_tables.sql.

ALTER TABLE public.sale_lines
  ADD CONSTRAINT sale_lines_tenant_sale_id_unique
  UNIQUE (tenant_id, sale_id, id);

ALTER TABLE public.sale_farmer_allocations
  DROP CONSTRAINT IF EXISTS sale_farmer_allocations_tenant_id_sale_line_id_fkey;

ALTER TABLE public.sale_farmer_allocations
  ADD CONSTRAINT sale_farmer_allocations_sale_line_fk
  FOREIGN KEY (tenant_id, sale_id, sale_line_id)
  REFERENCES public.sale_lines (tenant_id, sale_id, id)
  ON DELETE RESTRICT;
