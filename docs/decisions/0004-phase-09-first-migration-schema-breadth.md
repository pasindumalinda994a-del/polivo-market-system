# 0004 — Phase 09 First Migration Schema Breadth

- Status: Accepted
- Date: 2026-11-01

## Context and source

Phase 09 will introduce the local SQLite schema in `@polivo/db-local`. Before that work starts, the first migration’s table scope must be fixed so agents do not invent arrivals, inventory, permissions, or unapproved financial structures. Source: owner confirmation recorded ahead of `docs/implementation/09-local-sqlite-schema-and-migrations.md` (guide to be supplied before phase 09 implementation).

## Decision

The first local SQLite migration includes core operational tables only:

- Farmers and traders (parties).
- Vegetables.
- Sales and bill items.
- Farmer bills and trader bills.
- Payments and payment allocations.
- Default commission bands per stall.
- Audit history scaffolding.
- Synchronization outbox scaffolding.

All operational records are scoped to their stall.

The first migration must **not** include:

- Arrivals or inventory tables (later migrations when those phases begin; still planned for the first release).
- Staff permission tables (later migrations when permission enforcement begins).
- Lorry owner fields.
- Online farmer/trader approval tables.
- Vegetable-specific or category-specific commission override tables.
- Cheque-tracking / clearance-status tables.

Accepting this schema breadth does **not** confirm trader-cheque balance behavior. That remains a separate decision.

## Reasoning

A narrow first migration keeps financial and party foundations implementable without blocking on arrivals, inventory, or permission storage design. Excluding override and cheque-clearance tables prevents encoding unapproved product behavior into durable schema. Stall scoping matches tenant isolation requirements in `architecture.md`.

## Consequences

- Phase 09 implementation must follow this breadth once the numbered guide is present.
- Later migrations add arrivals, inventory, and staff permissions when those phases start.
- Payment method may still include `cheque` without modelling deposit, clearance, or bounce workflows.

## Related implementation phases

- Phase 08 — Business domain and financial rules
- Phase 09 — Local SQLite schema and migrations
- Later phases — Arrivals/inventory, permission enforcement, payment workflows
