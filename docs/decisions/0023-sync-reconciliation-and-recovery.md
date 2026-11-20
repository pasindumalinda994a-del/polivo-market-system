# 0023 — Sync Reconciliation and Recovery

- Status: Accepted
- Date: 2026-11-14

## Context and source

Phase 34 (`34-sync-reconciliation-and-recovery-interface.md`) requires an operational interface for sync progress, cutoff-based reconciliation, bounded recovery, and redacted diagnostics. Foundations: Phases 31–33 (ingest receipts, outbox worker, config sync), Phase 28 statement cutoffs, Phase 30 export boundary.

## Decision

1. **Three distinct checks.** Delivery reconciliation verifies cloud application receipts for local event groups. Data reconciliation verifies replicated facts/relationships at a shared cutoff. Reporting reconciliation verifies selected derived totals with equivalent Phase 28–30 definitions. Cursor match or aggregate totals alone are never complete proof.

2. **Common cutoff.** Comparisons use complete transaction-group boundaries. Capture local stream identity, local committed tail at run start, verified cloud application progress, a common comparable prefix, and definition/schema versions. Phrase results as “Matched through cutoff X”. Expected backlog, pending local acknowledgement, and true mismatches stay distinct. Do not hold a SQLite transaction open across network calls.

3. **Manifests.** Versioned canonical SHA-256 manifests (`manifestVersion` = `sync-manifest-v1`) define included fields, ordering, numeric/timestamp/null rules. Separate source event identity, transmitted (enriched) representation, replicated record content, and reporting projection content. Chunked compare (counts/hashes) then bounded mismatch detail. Exclude irrelevant cloud receipt timestamps from business-content hashes.

4. **Recovery boundaries.** Safe actions reuse Phase 32 outbox wake/retry/replay (original identities) and Phase 33 config refresh/apply/ack retry. Forbidden: Force synced, Skip event, Reset cursor, Delete failed event, Trust cloud balance, Recreate host identity, Fix all. Cloud projection drift is diagnosed (`stale_projection`); Phase 34 does not execute cloud projection repair.

5. **Plans and jobs.** State-changing recovery requires a concrete plan (action, scope, range/revision, expected state, affected count, safety rationale, capability). Recheck eligibility before execute; reject stale plans; idempotent execution; durable job lifecycle (`requested`…`outcome_uncertain`). Cancellation stops future work only.

6. **Capabilities.** Separate operational grants: `sync.view`, `sync.reconcile`, `sync.retry`, `sync.recover`, `sync.export_diagnostics`. Reporting-only users do not receive recover/retry. Sync/config operator surfaces use these caps (not sole `settings.manage`).

7. **Authority.** Local financial records remain authoritative. Recovery must not create duplicate sales, bills, ledger postings, payments, allocations, or commission charges. Host replacement, database restore, and full backup recovery remain later phases.

## Reasoning

Operators need truthful sync visibility without unsafe “make it green” controls. Reusing workers and original identities preserves Phase 31 duplicate detection. Separate capabilities prevent every reporting user from running recovery. Diagnose-only projection drift avoids inventing a rebuild path before retained cloud facts are sufficient.

## Consequences

- Local migration `019` stores reconciliation runs, recovery plans/jobs, and diagnostic export jobs.
- Cloud RPCs/routes expose bounded stream progress, receipt lookup, and scoped summaries under host possession (owner membership for read-only web visibility).
- Desktop consolidates upload + config + reconcile + recovery into one Sync Workspace.
- Ops guide documents guarantees, unavailable actions, and the integrated Phase 31–34 live acceptance checklist.

## Related implementation phases

- Phase 28 — account statements and outstanding (cutoff/watermark pattern)
- Phase 30 — reports and trusted export boundary
- Phase 31 — cloud sync ingestion
- Phase 32 — local outbox sync worker
- Phase 33 — cloud configuration and access sync
- Phase 34 — sync reconciliation and recovery interface
- Phase 35 — cloud financial dashboards (not this phase)
