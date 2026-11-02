-- CR-04 (PR #4): enforce that sale_farmer_allocations.sale_line_id belongs to the same sale.
-- Idempotent: fresh installs already get this from 20251101120100; this upgrades older DBs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_lines_tenant_sale_id_unique'
      AND conrelid = 'public.sale_lines'::regclass
  ) THEN
    ALTER TABLE public.sale_lines
      ADD CONSTRAINT sale_lines_tenant_sale_id_unique
      UNIQUE (tenant_id, sale_id, id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_farmer_allocations_tenant_id_sale_id_fkey'
      AND conrelid = 'public.sale_farmer_allocations'::regclass
  ) THEN
    ALTER TABLE public.sale_farmer_allocations
      DROP CONSTRAINT sale_farmer_allocations_tenant_id_sale_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_farmer_allocations_tenant_id_sale_line_id_fkey'
      AND conrelid = 'public.sale_farmer_allocations'::regclass
  ) THEN
    ALTER TABLE public.sale_farmer_allocations
      DROP CONSTRAINT sale_farmer_allocations_tenant_id_sale_line_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_farmer_allocations_sale_line_fk'
      AND conrelid = 'public.sale_farmer_allocations'::regclass
  ) THEN
    ALTER TABLE public.sale_farmer_allocations
      ADD CONSTRAINT sale_farmer_allocations_sale_line_fk
      FOREIGN KEY (tenant_id, sale_id, sale_line_id)
      REFERENCES public.sale_lines (tenant_id, sale_id, id)
      ON DELETE RESTRICT;
  END IF;
END
$$;
