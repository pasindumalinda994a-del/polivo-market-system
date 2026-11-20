-- Keep in sync with packages/domain/src/permissions.ts PERMISSION_CAPABILITIES.
-- When adding a capability: update domain first, then replace this allowlist in a
-- forward migration. Unknown capability strings must remain rejected.

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
        'catalog.manage',
        'commission.manage',
        'accounts.view',
        'accounts.opening_prepare',
        'accounts.opening_post',
        'accounts.opening_correct',
        'documents.print',
        'documents.reprint',
        'inventory.manage_arrivals',
        'inventory.adjust',
        'data.export',
        'staff.manage',
        'settings.manage',
        'backups.restore'
      )
    );
$$;
