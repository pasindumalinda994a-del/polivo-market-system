import type { DbExecutor } from "./types.js";

export type AppendAuditEventInput = {
  id: string;
  stallId?: string | null;
  tenantId?: string | null;
  actorRef?: string | null;
  deviceRef?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  occurredAt: string;
  correlationRef?: string | null;
  reason?: string | null;
  /** Already-serialized JSON; must not contain secrets or unrestricted request bodies. */
  changeDetailsJson?: string | null;
};

export function appendAuditEvent(executor: DbExecutor, input: AppendAuditEventInput): void {
  executor.db
    .prepare(
      `INSERT INTO audit_events (
         id, stall_id, tenant_id, actor_ref, device_ref, action,
         target_type, target_id, occurred_at, correlation_ref, reason, change_details_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId ?? null,
      input.tenantId ?? null,
      input.actorRef ?? null,
      input.deviceRef ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.occurredAt,
      input.correlationRef ?? null,
      input.reason ?? null,
      input.changeDetailsJson ?? null,
    );
}
