# 32 — Local Outbox Sync Worker

## Objective

Implement the host-side worker that uploads committed local outbox events to the Phase 31 cloud ingestion API.

This phase must deliver:

- Secure loading of the existing enrolled host credential.
- Authenticated requests compatible with Phase 31.
- Ordered, bounded uploads of complete transaction groups.
- Durable acknowledgement handling.
- Safe retries, backoff, and restart recovery.
- Explicit handling of blocked or incompatible events.
- Basic authorized sync status and manual retry controls.
- End-to-end verification from local transaction to cloud reporting copy.

The worker runs inside the stall-service process on the authoritative host.

Desktop terminals must not run independent upload workers.

Local billing must remain independent of internet availability.

Cloud-to-local configuration and permission delivery belong to Phase 33. Full reconciliation and recovery UI belongs to Phase 34.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 14 enrollment and secure host credential storage.
- Existing host signing and device-proof code.
- Local outbox schema and event producers.
- Phase 31 ingestion contracts, authentication, transaction groups, acknowledgements, and errors.
- Existing service lifecycle and background-job patterns.
- Relevant restore and host-replacement decisions.

Inspect actual code to identify:

1. The secure location and format of the enrolled host key.
2. Whether the stall service can currently load that key.
3. How Phase 31 expects requests to be authenticated.
4. Stream identity, generation, and sequence conventions.
5. Complete transaction-group boundaries.
6. Historical outbox versions.
7. Existing acknowledgement and retry fields.
8. Local transaction and locking conventions.

Mark Phase 32 as `IN_PROGRESS`.

Do not assume that Phase 31’s live signed-host test passed if it remains pending because key loading was unavailable.

---

## 2. Complete the Host Credential Loading Path First

Before building the recurring worker, make one controlled authenticated development upload possible using the existing enrolled host identity.

Reuse Phase 14 credential storage.

On Windows:

- Load the credential through the approved secure-storage adapter.
- Run under the Windows account required by the existing activation model.
- Preserve the association between credential, device, stall, and stream.
- Return an actionable configuration error if secure storage cannot be opened.

Do not:

- Generate a replacement host key automatically.
- Export the private key into a plaintext environment variable.
- Ask operators to paste the private key into a script.
- Store credentials in renderer storage.
- Fall back to simulated secure storage in production.
- Disable request verification to make the harness pass.

Keep signing inside the service-side security boundary.

Expose a signing operation where practical rather than passing raw key material throughout the worker.

Update the development harness to use the same production credential-loading and signing path.

---

## 3. Verify Authentication Compatibility

Use the exact Phase 31 request-authentication protocol.

Confirm:

- Method and endpoint binding.
- Body digest or canonicalization rules.
- Device identity.
- Request timestamp and nonce where required.
- Credential/key identifier.
- Signature encoding.
- Allowed clock skew.
- Retry behavior.

Serialize the request once and sign the bytes required by the protocol.

Do not sign one representation and transmit a differently serialized body.

Each network retry may use fresh transport authentication while preserving the same immutable events.

Handle clock-skew rejection as an actionable condition. Do not change the system clock or disable freshness checks automatically.

If authentication fails, preserve the outbox and suspend uploads according to the error policy.

---

## 4. Define Worker Ownership and Lifecycle

Start the worker through the stall service’s existing lifecycle.

It must:

- Run only on an activated authoritative host.
- Wait until the database and secure credential adapter are ready.
- Use one active upload loop per source stream.
- Stop cleanly during service shutdown.
- Resume from durable state after restart.

Prevent overlapping loops caused by:

- Startup hooks.
- Timers.
- New-event notifications.
- Manual retry.
- Multiple service instances.

Use the existing single-instance mechanism where sufficient.

If database leases are needed, include ownership tokens and fencing for local state updates. An expired worker must not overwrite progress recorded by a newer owner.

Do not rely solely on a renderer flag or an in-memory boolean when multiple service processes are possible.

---

## 5. Inspect and Extend Durable Worker State

Reuse existing outbox structures.

Add forward-only local migrations only where required for:

- Delivery status.
- Attempt metadata.
- Next retry time.
- Last safe error code.
- Acknowledged identity/hash.
- Stream cursor.
- Worker lease or ownership state.
- Blocking event/group reference.

Separate immutable event data from mutable delivery metadata.

Once an event has been committed:

- Preserve its ID.
- Preserve its source sequence.
- Preserve its schema version and payload.
- Preserve its transaction-group identity.

Do not rewrite historical payloads to bypass ingestion validation.

Never delete operational records after sync.

Do not add automatic outbox purging in this phase. Any future retention policy must preserve replay, audit, and recovery guarantees.

---

## 6. Verify Outbox Completeness at the Source

Inspect all implemented event producers.

Confirm operational mutations write their required events in the same SQLite transaction as their source records.

Check:

- Party and catalog changes.
- Commission activation.
- Opening balances.
- Sales and bills.
- Payments and allocations.
- Corrections and reversals.
- Approved operational audit events.

A source transaction that commits without its required outbox event cannot be repaired merely by retrying the worker.

Fix producer defects with meaningful regression tests.

For existing missing historical events:

- Identify affected records.
- Record the gap.
- Define a deterministic repair or bootstrap requirement.
- Do not silently mark those records synchronized.
- Do not fabricate event history from mutable current values.

Keep unrelated historical acceptance checks visible.

---

## 7. Build Ordered, Complete Batches

Read pending events in the Phase 31 source order.

Respect:

- Event count limits.
- Encoded byte limits.
- Transaction-group boundaries.
- Dependency ordering.
- Protocol compatibility.

Never split a transaction group if the ingestion contract requires atomic complete groups.

Calculate limits from the actual encoded request.

If one group exceeds the supported limit:

- Block that group with an explicit error.
- Preserve its data.
- Do not truncate it.
- Do not invent a multipart protocol without updating Phase 31 deliberately.

Do not send later dependent groups around a blocked earlier group.

Follow the actual expected-next sequence rule. Do not assume all integer sequence positions exist if the source model permits gaps.

Use stable batch contents for an in-flight attempt.

Do not hold a SQLite transaction open during the HTTP request.

---

## 8. Implement the Upload Cycle

A normal cycle must:

1. Confirm worker ownership and source readiness.
2. Check durable retry eligibility.
3. Read the next complete bounded batch.
4. Validate it locally against shared contracts.
5. Persist necessary attempt metadata.
6. Load or access the authorized signing capability.
7. Build and authenticate the request.
8. Send it with a bounded timeout.
9. Validate the response.
10. Commit valid acknowledgement progress locally.
11. Schedule the next cycle.

If no events are pending, wait using the established scheduler.

Wake promptly when a new local transaction commits, while retaining periodic polling as a fallback.

Use bounded catch-up processing so a large backlog does not monopolize CPU, database access, or network resources.

---

## 9. Validate Acknowledgements Before Advancing

Use Phase 31’s exact response contract.

Verify:

- Expected protocol.
- Source stream and generation.
- Request correlation where applicable.
- Acknowledged event/group identities.
- Applied or matching-duplicate outcomes.
- Valid committed cursor.
- Consistency with locally known event positions.

An HTTP success code alone is insufficient.

Do not mark a whole batch delivered when only a prefix was acknowledged.

Within one local SQLite transaction:

- Mark explicitly verified events/groups acknowledged.
- Store relevant cloud receipt metadata.
- Advance the local contiguous cursor.
- Clear or update retry state.
- Record last acknowledged progress.

Do not advance based solely on a remote cursor beyond locally verified content.

If cloud progress is ahead after a lost response, replay the relevant events to obtain matching duplicate acknowledgements or use the approved proof/receipt protocol.

Never overwrite local source data with cloud reporting rows.

---

## 10. Recover Safely Across Crash Windows

Test and handle:

### Crash before sending

Pending events remain eligible after restart.

### Cloud commit followed by lost response

Resend the same immutable events.

Cloud duplicate detection must return the existing committed result.

### Response received before local acknowledgement commit

Resend safely after restart.

### Partial cloud prefix committed

Acknowledge only the verified prefix and resume at the first unacknowledged group.

### Local acknowledgement transaction fails

Leave progress unadvanced and retry safely.

### Shutdown during a request

Abort or allow bounded completion under the service shutdown policy.

An aborted request may already have committed remotely. Recovery must replay rather than assume failure.

Do not claim exactly-once network delivery.

The design provides retryable delivery with duplicate-safe cloud application.

---

## 11. Implement Retry and Backoff

Classify failures using Phase 31 error codes and transport outcomes.

For transient failures such as:

- Network unavailable.
- DNS failure.
- Timeout.
- Connection reset.
- Temporary server error.
- Rate limiting.

Use exponential backoff with jitter and a documented maximum delay.

Honor valid server retry guidance within configured bounds.

Persist next-attempt information so service restarts do not create a retry storm.

Use injectable clocks and randomness for tests.

Reset the retry progression after meaningful successful progress under the documented policy.

Do not exhaust a retry count and delete events.

Pending data must remain available through long outages.

---

## 12. Stop Safely on Blocking Errors

Treat these as explicit blocked conditions where appropriate:

- Revoked or replaced host.
- Invalid credential or signature configuration.
- Unsupported protocol/event version.
- Payload identity conflict.
- Stream-generation mismatch.
- Irrecoverable sequence gap.
- Missing historical dependency.
- Oversized transaction group.
- Invalid committed source event.

Preserve the first blocking group and diagnostics.

Do not:

- Skip the event.
- Mark it delivered.
- Delete it.
- Reassign its ID.
- Reset the cloud cursor.
- Mint a new stream generation.
- Automatically replace the enrolled host.

Manual retry may recheck a resolved condition, but it must not bypass validation.

Distinguish “waiting to retry” from “requires attention.”

Phase 34 will provide fuller recovery workflows.

---

## 13. Protect Endpoint and Transport Configuration

Use an explicitly configured ingestion base URL.

Require HTTPS for deployed environments.

If local development permits HTTP, constrain it through an explicit development-only configuration.

Do not disable TLS certificate verification.

Do not follow redirects that could forward signed requests or credentials to an unintended origin.

Validate endpoint changes through the existing trusted configuration path.

Do not accept upload destinations from outbox payloads or arbitrary renderer input.

Bound response size and parsing work.

Keep credentials, signatures, full financial payloads, and sensitive headers out of logs.

Do not install Supabase privileged keys on the host.

---

## 14. Keep Billing Independent of Sync

The upload worker must not become a dependency of local transaction success.

A valid local operation commits its business records and outbox events locally.

Cloud acknowledgement is not required to:

- Finalize a sale.
- Issue a farmer bill.
- Record a permitted payment.
- Print an existing bill.
- View local reports.

Existing local authorization and offline-expiry policies still apply.

Do not extend offline access merely because uploads are failing.

Keep SQLite write transactions short.

Avoid long scans and repeated updates across the whole outbox.

Monitor backlog size and disk errors through existing service diagnostics.

Do not silently discard pending events to free disk space.

---

## 15. Add Minimal Sync Status and Controls

Expose an authorized service status endpoint for the desktop.

Include safe information such as:

- Worker enabled/disabled state.
- Source readiness.
- Pending event/group count.
- Oldest pending recording time.
- Last upload attempt.
- Last acknowledged progress.
- Current backoff deadline.
- Blocking error code.
- Current local tail and acknowledged cursor.

Distinguish:

- Up to date through a captured local tail.
- Uploading.
- Waiting for connection/retry.
- Paused.
- Configuration required.
- Blocked.

Do not display “Everything synced” based only on a successful HTTP request.

Record when the local tail was measured.

Provide a bounded “Retry now” action using the same worker lock.

It must not start a parallel loop or bypass authentication, compatibility, or server throttling.

Keep detailed reconciliation controls for Phase 34.

---

## 16. Preserve Security and Session Boundaries

The background worker authenticates as the enrolled host.

It should not depend on a desktop operator keeping a local staff session open.

Interactive status and retry controls still require approved staff permissions.

Do not expose the host signing capability to the renderer.

Do not upload local authentication secrets, password hashes, session tokens, or device private keys.

Use the Phase 31 event allowlist.

Preserve historical staff identifiers only as approved provenance.

If cloud access revocation is learned through an upload response, stop uploads and update trusted diagnostics. Do not invent local staff-policy changes from an error string.

Access/configuration synchronization belongs to Phase 33.

---

## 17. Handle Restore and Host-Replacement Boundaries

Detect mismatches between:

- Enrolled host.
- Local database identity.
- Source stream.
- Generation.
- Cloud committed state.

A restored older database may contain already-applied events. Replay them through normal duplicate verification where identities match.

If it attempts to reuse an acknowledged sequence for different content, block and report the conflict.

Do not automatically reset the database, re-enroll the host, or fork the stream.

Document the required handoff to the later restore and reconciliation workflows.

Keep acknowledged operational data locally available.

Do not treat cloud reporting replication as a replacement for backup.

---

## 18. Add Automated Worker Tests

Use an injectable transport, scheduler, clock, secure-storage adapter, and deterministic test fixtures.

### Credential and signing tests

Cover:

- Existing enrolled key loading.
- Missing secure-storage data.
- Wrong Windows/security context.
- Signature/body mismatch.
- Fresh authentication on event replay.
- No plaintext production fallback.
- Secrets absent from diagnostics.

### Batch tests

Cover:

- Ordered complete groups.
- Byte and event limits.
- Oversized single group.
- Historical supported versions.
- Invalid first group blocking later groups.
- New events arriving during upload.

### Retry and recovery tests

Cover:

- Offline startup.
- Connection restored.
- Timeout after cloud commit.
- Partial-prefix acknowledgement.
- Malformed response.
- Wrong stream/generation response.
- Acknowledgement beyond submitted or verified data.
- Local acknowledgement rollback.
- Restart during backoff.
- Shutdown during upload.
- Rate limiting.
- Permanent blocking errors.
- Two competing worker instances.

### Financial integration tests

Upload a complete local flow:

1. Parties and catalog.
2. Commission policy.
3. Opening balances.
4. Sale and buyer bill.
5. Farmer bill.
6. Cash/bank payment.
7. Cheque handover.
8. Allocation changes where supported.
9. Payment reversal.
10. Sale correction.

Verify local and cloud facts and totals at the same acknowledged cutoff.

Confirm replays do not duplicate sales, ledger entries, obligations, payments, or allocations.

---

## 19. Complete a Live Development Smoke Test

Prepare a controlled development checklist using an enrolled test host.

1. Confirm Phase 31 development migrations and endpoint.
2. Confirm the existing host credential loads through secure storage.
3. Send one authenticated test group through the real signing path.
4. Verify the cloud acknowledgement.
5. Verify expected cloud records.
6. Enable the recurring worker.
7. Create a small local test transaction.
8. Verify automatic upload and local acknowledgement.
9. Disconnect internet while leaving the stall service and LAN available.
10. Create another permitted local test transaction.
11. Verify it remains pending and local operation succeeds.
12. Restore internet.
13. Verify catch-up without duplicate cloud effects.
14. Restart during a pending upload or backoff.
15. Verify recovery.
16. Simulate a lost response after cloud commit.
17. Verify replay returns matching duplicates.
18. Verify status accurately shows pending and acknowledged progress.
19. Confirm local operational records remain after sync.

Use synthetic development data.

Do not export the host private key to run this test.

If real secure-storage or deployed authentication testing cannot run, record it as pending and distinguish it from mocked test coverage.

---

## 20. Update Documentation and Report Completion

Create or update:

`docs/operations/local-outbox-sync-worker.md`

Document:

- Host credential loading.
- Endpoint configuration.
- Worker startup and shutdown.
- Ownership/lease behavior.
- Batching and group ordering.
- Acknowledgement validation.
- Retry classification.
- Blocked conditions.
- Status meanings.
- Live smoke-test procedure.
- Restore and host-replacement limitations.
- Phase 33 and Phase 34 integration boundaries.

Apply required local changes using forward migrations:

`pnpm --filter @polivo/db-local db:migrate`

Do not initialize or reset an existing database.

Update context files and the progress tracker.

Run applicable formatting, lint, type, worker, security, database, cloud-ingestion, integration, and build checks.

Report:

1. Files and migrations changed.
2. Secure key-loading and signing implementation.
3. Worker lifecycle and ownership.
4. Batch and acknowledgement guarantees.
5. Retry and blocked-state behavior.
6. Automated test results.
7. Live signed-host verification results.
8. Remaining historical-event or bootstrap gaps.
9. Pending operator checks.
10. Readiness for Phase 33.

## Acceptance Criteria

- The worker uses the existing enrolled host credential securely.
- One authorized host worker uploads each source stream.
- Complete groups are sent in the required order.
- Local transactions remain independent of cloud availability.
- Only verified committed acknowledgements advance local progress.
- Retry and restart recovery cannot duplicate cloud financial effects.
- Invalid or conflicting events block visibly without being discarded.
- Backoff prevents retry storms.
- Local operational data remains after acknowledgement.
- Status distinguishes pending, retrying, blocked, and acknowledged progress.
- Real authentication verification is separated from simulated tests.
- Tests pass and remaining acceptance work is documented.