-- Phase 11: minimal sync receipt metadata for later ingestion (phases 31–34).
-- Does not mirror the local sync_outbox delivery queue.
-- Source occurred_at is distinct from cloud received_at.

CREATE TABLE public.sync_received_events (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_schema_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_revision INTEGER,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX sync_received_events_stall_received_idx
  ON public.sync_received_events (tenant_id, stall_id, received_at);
