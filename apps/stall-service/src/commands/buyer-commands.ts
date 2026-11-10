import {
  BUYER_CREATED_EVENT_TYPE,
  BUYER_EVENT_SCHEMA_VERSION,
  BUYER_STATUS_CHANGED_EVENT_TYPE,
  BUYER_UPDATED_EVENT_TYPE,
  buyerRecordSchema,
  buyerSnapshotEventPayloadSchema,
  changeBuyerStatusRequestSchema,
  createBuyerRequestSchema,
  updateBuyerRequestSchema,
  type BuyerRecordDto,
  type ChangeBuyerStatusRequest,
  type CreateBuyerRequest,
  type UpdateBuyerRequest,
} from "@polivo/contracts";
import {
  classifySqliteError,
  getBuyerById,
  insertBuyer,
  setBuyerActiveWithExpectedRevision,
  updateBuyerWithExpectedRevision,
  type BuyerRecord,
  type TxHandle,
} from "@polivo/db-local";

import type { ExecutionContext } from "../context/execution-context.js";
import { conflictError, notFoundError } from "../errors/app-error.js";
import {
  runIdempotentCommand,
  writeAuditAndOutbox,
  type CommandDefinition,
  type CommandDeps,
} from "./command-runner.js";

export const BUYER_MANAGE_CAPABILITY = "parties.register_edit";

export function toBuyerDto(record: BuyerRecord): BuyerRecordDto {
  return buyerRecordSchema.parse({
    id: record.id,
    shortCode: record.shortCode,
    displayName: record.displayName,
    contactNumber: record.contactNumber,
    locality: record.locality,
    isActive: record.isActive,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function snapshotPayload(buyer: BuyerRecordDto, stallId: string) {
  return buyerSnapshotEventPayloadSchema.parse({ buyer, stallId });
}

function createBuyerDefinition(
  deps: CommandDeps,
): CommandDefinition<CreateBuyerRequest, BuyerRecordDto> {
  return {
    type: "buyer.create",
    version: "1",
    requiredCapability: BUYER_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: CreateBuyerRequest;
    }) => {
      const now = deps.now();
      const id = deps.createId();
      let created: BuyerRecord;
      try {
        created = insertBuyer(tx, {
          id,
          stallId: context.stallId,
          shortCode: input.shortCode,
          displayName: input.displayName,
          contactNumber: input.contactNumber ?? null,
          locality: input.locality ?? null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        const classified = classifySqliteError(error);
        if (classified.kind === "unique_constraint") {
          throw conflictError("A buyer with this short code already exists for this stall.");
        }
        throw error;
      }

      const dto = toBuyerDto(created);
      writeAuditAndOutbox({
        tx,
        context,
        action: "buyer.created",
        targetType: "buyer",
        targetId: created.id,
        eventType: BUYER_CREATED_EVENT_TYPE,
        eventSchemaVersion: BUYER_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => buyerRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type UpdateBuyerCommandInput = UpdateBuyerRequest & { buyerId: string };

function updateBuyerDefinition(
  deps: CommandDeps,
): CommandDefinition<UpdateBuyerCommandInput, BuyerRecordDto> {
  return {
    type: "buyer.update",
    version: "1",
    requiredCapability: BUYER_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: UpdateBuyerCommandInput;
    }) => {
      const existing = getBuyerById(tx, context.stallId, input.buyerId);
      if (existing === null) {
        throw notFoundError("Buyer not found for this stall.");
      }

      const now = deps.now();
      updateBuyerWithExpectedRevision(tx, context.stallId, input.buyerId, {
        expectedRevision: input.expectedRevision,
        displayName: input.displayName,
        contactNumber: input.contactNumber,
        locality: input.locality,
        updatedAt: now,
      });

      const updated = getBuyerById(tx, context.stallId, input.buyerId);
      if (updated === null) {
        throw notFoundError("Buyer not found for this stall.");
      }
      const dto = toBuyerDto(updated);
      writeAuditAndOutbox({
        tx,
        context,
        action: "buyer.updated",
        targetType: "buyer",
        targetId: updated.id,
        eventType: BUYER_UPDATED_EVENT_TYPE,
        eventSchemaVersion: BUYER_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => buyerRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type ChangeBuyerStatusCommandInput = ChangeBuyerStatusRequest & { buyerId: string };

function changeBuyerStatusDefinition(
  deps: CommandDeps,
): CommandDefinition<ChangeBuyerStatusCommandInput, BuyerRecordDto> {
  return {
    type: "buyer.set_status",
    version: "1",
    requiredCapability: BUYER_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: ChangeBuyerStatusCommandInput;
    }) => {
      const existing = getBuyerById(tx, context.stallId, input.buyerId);
      if (existing === null) {
        throw notFoundError("Buyer not found for this stall.");
      }

      const now = deps.now();
      setBuyerActiveWithExpectedRevision(tx, context.stallId, input.buyerId, {
        expectedRevision: input.expectedRevision,
        isActive: input.status === "active",
        updatedAt: now,
      });

      const updated = getBuyerById(tx, context.stallId, input.buyerId);
      if (updated === null) {
        throw notFoundError("Buyer not found for this stall.");
      }
      const dto = toBuyerDto(updated);
      writeAuditAndOutbox({
        tx,
        context,
        action: "buyer.status_changed",
        targetType: "buyer",
        targetId: updated.id,
        eventType: BUYER_STATUS_CHANGED_EVENT_TYPE,
        eventSchemaVersion: BUYER_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => buyerRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export function runCreateBuyerCommand(
  deps: CommandDeps,
  input: CreateBuyerRequest,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): BuyerRecordDto {
  return runIdempotentCommand(deps, createBuyerDefinition(deps), {
    input: createBuyerRequestSchema.parse(input),
    ...meta,
  });
}

export function runUpdateBuyerCommand(
  deps: CommandDeps,
  input: UpdateBuyerCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): BuyerRecordDto {
  const { buyerId, ...body } = input;
  return runIdempotentCommand(deps, updateBuyerDefinition(deps), {
    input: { buyerId, ...updateBuyerRequestSchema.parse(body) },
    ...meta,
  });
}

export function runChangeBuyerStatusCommand(
  deps: CommandDeps,
  input: ChangeBuyerStatusCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): BuyerRecordDto {
  const { buyerId, ...body } = input;
  return runIdempotentCommand(deps, changeBuyerStatusDefinition(deps), {
    input: { buyerId, ...changeBuyerStatusRequestSchema.parse(body) },
    ...meta,
  });
}
