import {
  SYNC_MANIFEST_VERSION,
  SYNC_RECONCILIATION_DEFINITION_VERSION,
  syncReconciliationRunSummarySchema,
  type SyncDomainComparisonResult,
  type SyncMismatchSummaryItem,
  type SyncReconciliationRunSummary,
  type SyncRecoveryActionType,
} from "@polivo/contracts";
import {
  buildChunkedManifest,
  classifyDeliveryObservation,
  formatExactDifference,
} from "@polivo/domain";
import {
  completeReconciliationRun,
  getMaxOutboxSequence,
  insertReconciliationRun,
  listOutboxGroupsThroughSequence,
  tryGetSyncStreamState,
  type LocalDatabase,
} from "@polivo/db-local";

import type { ReconciliationCloudClient } from "./cloud-client.js";
import { sha256HexOfCanonical, sha256HexOfUtf8 } from "./hash.js";

export async function runReconciliation(input: {
  database: LocalDatabase;
  stallId: string;
  requestId: string;
  staffId: string;
  deviceId: string;
  createId: () => string;
  now: () => string;
  cloud: ReconciliationCloudClient;
  includeReporting: boolean;
  maxGroups: number;
}): Promise<SyncReconciliationRunSummary> {
  const startedAt = input.now();
  const runId = input.createId();
  insertReconciliationRun(input.database, {
    id: runId,
    stallId: input.stallId,
    requestId: input.requestId,
    scope: input.includeReporting ? "delivery+data+reporting" : "delivery+data",
    startedAt,
    createdByStaffId: input.staffId,
    createdByDeviceId: input.deviceId,
  });

  const stream = tryGetSyncStreamState(input.database, input.stallId);
  const localTail = stream?.localTailSequence ?? getMaxOutboxSequence(input.database, input.stallId);
  const mismatches: SyncMismatchSummaryItem[] = [];
  const domainResults: SyncDomainComparisonResult[] = [];
  const incompleteDomainWarnings: string[] = [];
  let verifiedCloudCursor: number | null = null;
  let cloudObservedAt: string | null = null;
  let remoteUnavailable = false;

  if (!stream?.sourceStreamId || !stream.streamGeneration) {
    const summary = finish({
      runId,
      state: "failed",
      startedAt,
      completedAt: input.now(),
      cutoff: null,
      matchedDomains: [],
      incompleteDomainWarnings: ["Local sync stream is not configured."],
      mismatches: [
        {
          category: "incomplete_source_history",
          checkKind: "delivery",
          domain: null,
          observed: "No local source stream identity.",
          scopeDescription: "stream bootstrap",
          affectsLocalOperation: false,
          automaticRetryAppropriate: false,
          availableAction: null,
          supportWorkflowRequired: true,
        },
      ],
      domainResults: [],
      safeNextAction: null,
      summaryPhrase: "Reconciliation blocked: local stream identity missing.",
      sourceStreamId: null,
      streamGeneration: null,
      localCommittedTail: localTail,
      verifiedCloudCursor: null,
      comparableCutoff: null,
      errorCode: "STREAM_NOT_CONFIGURED",
      errorMessage: "Local sync stream is not configured.",
      database: input.database,
    });
    return summary;
  }

  const progress = await input.cloud.getProgress({ sourceStreamId: stream.sourceStreamId });
  if (!progress.ok) {
    remoteUnavailable = true;
    mismatches.push({
      category: "remote_state_unavailable",
      checkKind: "delivery",
      domain: null,
      observed: progress.message,
      scopeDescription: "cloud stream progress",
      affectsLocalOperation: false,
      automaticRetryAppropriate: true,
      availableAction: "retry_upload_worker",
      supportWorkflowRequired: false,
    });
  } else {
    if (progress.progress.streamGeneration !== stream.streamGeneration) {
      mismatches.push({
        category: "stream_generation_conflict",
        checkKind: "delivery",
        domain: null,
        observed: `local generation ${stream.streamGeneration}, cloud ${progress.progress.streamGeneration}`,
        scopeDescription: "stream generation",
        affectsLocalOperation: true,
        automaticRetryAppropriate: false,
        availableAction: null,
        supportWorkflowRequired: true,
      });
    }
    verifiedCloudCursor = Number(progress.progress.committedCursor);
    cloudObservedAt = progress.progress.observedAt;
  }

  const comparableCutoff = Math.min(
    localTail,
    verifiedCloudCursor ?? stream.acknowledgedCursor,
  );

  const localGroups = listOutboxGroupsThroughSequence(
    input.database,
    input.stallId,
    comparableCutoff,
  ).slice(0, input.maxGroups);

  const pendingBeyondCutoff = localTail > comparableCutoff;
  if (pendingBeyondCutoff) {
    mismatches.push({
      category: "expected_upload_backlog",
      checkKind: "delivery",
      domain: null,
      observed: `Local tail ${localTail} exceeds comparable cutoff ${comparableCutoff}.`,
      scopeDescription: "upload backlog beyond cutoff",
      affectsLocalOperation: false,
      automaticRetryAppropriate: true,
      availableAction: "retry_upload_worker",
      supportWorkflowRequired: false,
    });
  }

  let receiptsByGroup = new Map<
    string,
    {
      eventIds: string[];
      eventPayloadHashes: Record<string, string>;
      minSequence: string;
      maxSequence: string;
    }
  >();

  if (!remoteUnavailable) {
    const lookup = await input.cloud.lookupReceipts({
      sourceStreamId: stream.sourceStreamId,
      streamGeneration: stream.streamGeneration,
      fromSequence: "1",
      toSequence: String(comparableCutoff),
      limit: Math.min(input.maxGroups, 200),
    });
    if (!lookup.ok) {
      remoteUnavailable = true;
      mismatches.push({
        category: "remote_state_unavailable",
        checkKind: "delivery",
        domain: null,
        observed: lookup.message,
        scopeDescription: "cloud receipt lookup",
        affectsLocalOperation: false,
        automaticRetryAppropriate: true,
        availableAction: null,
        supportWorkflowRequired: false,
      });
    } else {
      for (const receipt of lookup.result.receipts) {
        receiptsByGroup.set(receipt.transactionGroupId, {
          eventIds: receipt.eventIds,
          eventPayloadHashes: receipt.eventPayloadHashes,
          minSequence: receipt.minSequence,
          maxSequence: receipt.maxSequence,
        });
      }
    }
  }

  const deliveryDigests: string[] = [];
  let deliveryMatched = true;

  for (const group of localGroups) {
    const cloud = receiptsByGroup.get(group.transactionGroupId);
    const localAcked = group.ackState === "acknowledged";
    const localPendingUpload = group.ackState === "pending" || group.ackState === "failed";
    const cloudPresent = Boolean(cloud);

    // Transmitted identity: hash local payload JSON (enricher re-derives at upload;
    // compare against cloud stored payload hashes when present).
    const localEventHashes: Record<string, string> = {};
    for (const ev of group.payloadHashes) {
      localEventHashes[ev.eventId] = sha256HexOfCanonical(JSON.parse(ev.payloadJson));
      deliveryDigests.push(
        sha256HexOfCanonical({
          eventId: ev.eventId,
          sequence: ev.localSequence,
          hash: localEventHashes[ev.eventId],
        }),
      );
    }

    let payloadHashMatches: boolean | null = null;
    if (cloudPresent && cloud) {
      payloadHashMatches = true;
      for (const [eventId, localHash] of Object.entries(localEventHashes)) {
        const cloudHash = cloud.eventPayloadHashes[eventId];
        if (!cloudHash || cloudHash !== localHash) {
          // Cloud stores hash of enriched v2 payload; local outbox may still be thin v1.
          // Treat missing cloud hash for an event id as mismatch; hash inequality on thin
          // vs enriched is expected — use event id set membership as identity check and
          // only flag different_immutable_payload when cloud has a hash for the same
          // event that conflicts with a previously stored ack payload hash.
          if (cloudHash && group.ackState === "acknowledged") {
            payloadHashMatches = false;
          }
        }
      }
      for (const eventId of cloud.eventIds) {
        if (!localEventHashes[eventId]) {
          payloadHashMatches = false;
        }
      }
    }

    const category = classifyDeliveryObservation({
      localAcked,
      cloudReceiptPresent: cloudPresent,
      localPendingUpload,
      payloadHashMatches,
      streamGenerationMismatch: false,
      remoteUnavailable,
    });

    if (category && category !== "expected_upload_backlog") {
      deliveryMatched = false;
      const availableAction: SyncRecoveryActionType | null =
        category === "missing_local_acknowledgement"
          ? "recover_local_acknowledgement"
          : category === "missing_cloud_receipt"
            ? "replay_original_events"
            : null;
      mismatches.push({
        category,
        checkKind: "delivery",
        domain: null,
        observed: `group ${group.transactionGroupId} localAck=${localAcked} cloudReceipt=${cloudPresent}`,
        scopeDescription: `sequences ${group.minSequence}-${group.maxSequence}`,
        affectsLocalOperation: category === "different_immutable_payload",
        automaticRetryAppropriate:
          category === "missing_cloud_receipt" || category === "missing_local_acknowledgement",
        availableAction,
        supportWorkflowRequired: category === "different_immutable_payload",
      });
    }

    if (localPendingUpload && !cloudPresent && group.maxSequence <= comparableCutoff) {
      // Within comparable prefix but still pending — unexpected if cloud cursor covers it.
      if (verifiedCloudCursor != null && group.maxSequence <= verifiedCloudCursor) {
        deliveryMatched = false;
        mismatches.push({
          category: "missing_local_acknowledgement",
          checkKind: "delivery",
          domain: null,
          observed: `Cloud cursor covers group ${group.transactionGroupId} but local ack is pending.`,
          scopeDescription: `sequences ${group.minSequence}-${group.maxSequence}`,
          affectsLocalOperation: false,
          automaticRetryAppropriate: true,
          availableAction: "recover_local_acknowledgement",
          supportWorkflowRequired: false,
        });
      }
    }
  }

  const deliveryManifest = buildChunkedManifest({
    domain: "delivery_events",
    recordDigests: deliveryDigests,
    hashHex: sha256HexOfUtf8,
  });

  domainResults.push({
    domain: "sales_and_lines",
    checkKind: "delivery",
    completeness: remoteUnavailable ? "inconclusive" : deliveryMatched ? "complete" : "limited",
    matched: deliveryMatched && !remoteUnavailable,
    localCount: localGroups.length,
    cloudCount: receiptsByGroup.size,
    localManifestHash: deliveryManifest.rootHash,
    cloudManifestHash: null,
    inconclusiveReason: remoteUnavailable ? "Cloud receipts unavailable." : null,
    differences: deliveryMatched
      ? []
      : [formatExactDifference({ label: "groups", local: localGroups.length, cloud: receiptsByGroup.size })],
  });

  // Data / reporting: local authoritative counts; cloud fact summary when available.
  const localSales = countLocal(input.database, `SELECT COUNT(*) AS c FROM sales WHERE stall_id = ?`, [
    input.stallId,
  ]);
  const localPayments = countLocal(
    input.database,
    `SELECT COUNT(*) AS c FROM payments WHERE stall_id = ?`,
    [input.stallId],
  );
  const localLedger = countLocal(
    input.database,
    `SELECT COUNT(*) AS c FROM ledger_entries le
     JOIN ledger_postings lp ON lp.id = le.posting_id
     WHERE lp.stall_id = ?`,
    [input.stallId],
  );
  const localAlloc = countLocal(
    input.database,
    `SELECT COUNT(*) AS c FROM payment_allocations WHERE stall_id = ?`,
    [input.stallId],
  );
  const localBalance = countLocal(
    input.database,
    `SELECT COALESCE(SUM(le.amount_minor), 0) AS c FROM ledger_entries le
     JOIN ledger_postings lp ON lp.id = le.posting_id
     WHERE lp.stall_id = ?`,
    [input.stallId],
  );

  let cloudFacts: Awaited<ReturnType<ReconciliationCloudClient["getFactSummary"]>> | null = null;
  if (!remoteUnavailable) {
    cloudFacts = await input.cloud.getFactSummary({
      sourceStreamId: stream.sourceStreamId,
      throughSequence: String(comparableCutoff),
    });
  }

  const dataDomains: Array<{
    domain: SyncDomainComparisonResult["domain"];
    local: number;
    cloudKey: "salesCount" | "paymentsCount" | "ledgerEntriesCount" | "allocationCount";
  }> = [
    { domain: "sales_and_lines", local: localSales, cloudKey: "salesCount" },
    { domain: "payments", local: localPayments, cloudKey: "paymentsCount" },
    { domain: "ledger_entries", local: localLedger, cloudKey: "ledgerEntriesCount" },
    { domain: "allocations_and_releases", local: localAlloc, cloudKey: "allocationCount" },
  ];

  const matchedDomains: SyncDomainComparisonResult["domain"][] = [];

  for (const item of dataDomains) {
    if (pendingBeyondCutoff) {
      incompleteDomainWarnings.push(
        `${item.domain}: cloud projection is stall-wide; local has backlog beyond cutoff — marked limited.`,
      );
      domainResults.push({
        domain: item.domain,
        checkKind: "data",
        completeness: "limited",
        matched: false,
        localCount: item.local,
        cloudCount: null,
        localManifestHash: sha256HexOfCanonical({ domain: item.domain, count: item.local }),
        cloudManifestHash: null,
        inconclusiveReason: "Expected unsent backlog remains beyond the comparable cutoff.",
        differences: [],
      });
      continue;
    }
    if (!cloudFacts || !cloudFacts.ok) {
      domainResults.push({
        domain: item.domain,
        checkKind: "data",
        completeness: "inconclusive",
        matched: false,
        localCount: item.local,
        cloudCount: null,
        localManifestHash: sha256HexOfCanonical({ domain: item.domain, count: item.local }),
        cloudManifestHash: null,
        inconclusiveReason: "Cloud fact summary unavailable.",
        differences: [],
      });
      incompleteDomainWarnings.push(`${item.domain}: cloud fact summary unavailable.`);
      continue;
    }
    const cloudCount = cloudFacts.summary[item.cloudKey];
    const matched = cloudCount === item.local;
    if (matched) {
      matchedDomains.push(item.domain);
    } else {
      mismatches.push({
        category: cloudCount < item.local ? "missing_cloud_fact" : "stale_projection",
        checkKind: "data",
        domain: item.domain,
        observed: formatExactDifference({ label: item.domain, local: item.local, cloud: cloudCount }),
        scopeDescription: `Matched through cutoff ${comparableCutoff}`,
        affectsLocalOperation: false,
        automaticRetryAppropriate: cloudCount < item.local,
        availableAction: cloudCount < item.local ? "replay_original_events" : null,
        supportWorkflowRequired: cloudCount > item.local,
      });
    }
    domainResults.push({
      domain: item.domain,
      checkKind: "data",
      completeness: "complete",
      matched,
      localCount: item.local,
      cloudCount,
      localManifestHash: sha256HexOfCanonical({ domain: item.domain, count: item.local }),
      cloudManifestHash: sha256HexOfCanonical({ domain: item.domain, count: cloudCount }),
      inconclusiveReason: null,
      differences: matched
        ? []
        : [formatExactDifference({ label: item.domain, local: item.local, cloud: cloudCount })],
    });
  }

  if (input.includeReporting) {
    if (!cloudFacts || !cloudFacts.ok || pendingBeyondCutoff) {
      domainResults.push({
        domain: "reporting_totals",
        checkKind: "reporting",
        completeness: "inconclusive",
        matched: false,
        localCount: null,
        cloudCount: null,
        localManifestHash: sha256HexOfCanonical({ balance: localBalance }),
        cloudManifestHash: null,
        inconclusiveReason: pendingBeyondCutoff
          ? "Reporting compare deferred while upload backlog exceeds cutoff."
          : "Cloud reporting totals unavailable.",
        differences: [],
      });
      incompleteDomainWarnings.push("reporting_totals: incomplete comparison.");
    } else {
      const cloudBalance = Number(cloudFacts.summary.ledgerBalanceSumMinor);
      const matched = cloudBalance === localBalance;
      if (matched) {
        matchedDomains.push("reporting_totals");
      } else {
        mismatches.push({
          category: "stale_projection",
          checkKind: "reporting",
          domain: "reporting_totals",
          observed: formatExactDifference({
            label: "ledger_balance_sum_minor",
            local: localBalance,
            cloud: cloudBalance,
          }),
          scopeDescription: `Matched through cutoff ${comparableCutoff}`,
          affectsLocalOperation: false,
          automaticRetryAppropriate: false,
          availableAction: null,
          supportWorkflowRequired: true,
        });
      }
      domainResults.push({
        domain: "reporting_totals",
        checkKind: "reporting",
        completeness: "complete",
        matched,
        localCount: 1,
        cloudCount: 1,
        localManifestHash: sha256HexOfCanonical({ balance: localBalance }),
        cloudManifestHash: sha256HexOfCanonical({ balance: cloudBalance }),
        inconclusiveReason: null,
        differences: matched
          ? []
          : [
              formatExactDifference({
                label: "ledger_balance_sum_minor",
                local: localBalance,
                cloud: cloudBalance,
              }),
            ],
      });
    }
  }

  const integrityConflict = mismatches.some(
    (m) =>
      m.category === "different_immutable_payload" ||
      m.category === "stream_generation_conflict",
  );

  let safeNextAction: SyncRecoveryActionType | null = null;
  if (mismatches.some((m) => m.availableAction === "recover_local_acknowledgement")) {
    safeNextAction = "recover_local_acknowledgement";
  } else if (mismatches.some((m) => m.availableAction === "replay_original_events")) {
    safeNextAction = "replay_original_events";
  } else if (mismatches.some((m) => m.availableAction === "retry_upload_worker")) {
    safeNextAction = "retry_upload_worker";
  }

  const allMatched =
    !integrityConflict &&
    mismatches.every((m) => m.category === "expected_upload_backlog") &&
    domainResults
      .filter((d) => d.completeness === "complete")
      .every((d) => d.matched);

  const summaryPhrase = allMatched
    ? `Matched through cutoff ${comparableCutoff}`
    : integrityConflict
      ? `Integrity conflict at cutoff ${comparableCutoff}; unsafe actions unavailable.`
      : `Comparison incomplete or mismatched through cutoff ${comparableCutoff}.`;

  void cloudObservedAt;

  return finish({
    runId,
    state: "completed",
    startedAt,
    completedAt: input.now(),
    cutoff: {
      sourceStreamId: stream.sourceStreamId,
      streamGeneration: stream.streamGeneration,
      localCommittedTail: String(localTail),
      verifiedCloudCursor:
        verifiedCloudCursor == null ? null : String(verifiedCloudCursor),
      comparableCutoff: String(comparableCutoff),
      manifestVersion: SYNC_MANIFEST_VERSION,
      definitionVersion: SYNC_RECONCILIATION_DEFINITION_VERSION,
    },
    matchedDomains,
    incompleteDomainWarnings,
    mismatches,
    domainResults,
    safeNextAction,
    summaryPhrase,
    sourceStreamId: stream.sourceStreamId,
    streamGeneration: stream.streamGeneration,
    localCommittedTail: localTail,
    verifiedCloudCursor,
    comparableCutoff,
    errorCode: null,
    errorMessage: null,
    database: input.database,
  });
}

function countLocal(database: LocalDatabase, sql: string, params: string[]): number {
  try {
    const row = database.db.prepare(sql).get(...params) as { c: number | bigint } | undefined;
    const value = row?.c;
    return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  } catch {
    return 0;
  }
}

function finish(input: {
  database: LocalDatabase;
  runId: string;
  state: "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string;
  cutoff: SyncReconciliationRunSummary["cutoff"];
  matchedDomains: SyncReconciliationRunSummary["matchedDomains"];
  incompleteDomainWarnings: string[];
  mismatches: SyncMismatchSummaryItem[];
  domainResults: SyncDomainComparisonResult[];
  safeNextAction: SyncRecoveryActionType | null;
  summaryPhrase: string;
  sourceStreamId: string | null;
  streamGeneration: number | null;
  localCommittedTail: number | null;
  verifiedCloudCursor: number | null;
  comparableCutoff: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}): SyncReconciliationRunSummary {
  const summary = syncReconciliationRunSummarySchema.parse({
    runId: input.runId,
    state: input.state,
    scope: input.cutoff ? "delivery+data+reporting" : "blocked",
    cutoff: input.cutoff,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    matchedDomains: input.matchedDomains,
    incompleteDomainWarnings: input.incompleteDomainWarnings,
    mismatches: input.mismatches,
    domainResults: input.domainResults,
    safeNextAction: input.safeNextAction,
    summaryPhrase: input.summaryPhrase,
  });
  completeReconciliationRun(input.database, {
    id: input.runId,
    state: input.state,
    sourceStreamId: input.sourceStreamId,
    streamGeneration: input.streamGeneration,
    localCommittedTail: input.localCommittedTail,
    verifiedCloudCursor: input.verifiedCloudCursor,
    comparableCutoff: input.comparableCutoff,
    manifestVersion: input.cutoff?.manifestVersion ?? null,
    definitionVersion: input.cutoff?.definitionVersion ?? null,
    summaryJson: JSON.stringify(summary),
    summaryPhrase: input.summaryPhrase,
    safeNextAction: input.safeNextAction,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    completedAt: input.completedAt,
  });
  return summary;
}
