import {
  FARMER_CREATED_EVENT_TYPE,
  FARMER_EVENT_SCHEMA_VERSION,
  FARMER_STATUS_CHANGED_EVENT_TYPE,
  FARMER_UPDATED_EVENT_TYPE,
  changeFarmerStatusRequestSchema,
  createFarmerRequestSchema,
  farmerRecordSchema,
  farmerSnapshotEventPayloadSchema,
  updateFarmerRequestSchema,
  type ChangeFarmerStatusRequest,
  type CreateFarmerRequest,
  type FarmerRecordDto,
  type UpdateFarmerRequest,
} from "@polivo/contracts";
import {
  classifySqliteError,
  getFarmerById,
  insertFarmer,
  setFarmerActiveWithExpectedRevision,
  updateFarmerWithExpectedRevision,
  type FarmerRecord,
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

export const FARMER_MANAGE_CAPABILITY = "parties.register_edit";

export function toFarmerDto(record: FarmerRecord): FarmerRecordDto {
  return farmerRecordSchema.parse({
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

function snapshotPayload(farmer: FarmerRecordDto, stallId: string) {
  return farmerSnapshotEventPayloadSchema.parse({ farmer, stallId });
}

function createFarmerDefinition(
  deps: CommandDeps,
): CommandDefinition<CreateFarmerRequest, FarmerRecordDto> {
  return {
    type: "farmer.create",
    version: "1",
    requiredCapability: FARMER_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: CreateFarmerRequest;
    }) => {
      const now = deps.now();
      const id = deps.createId();
      let created: FarmerRecord;
      try {
        created = insertFarmer(tx, {
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
          throw conflictError("A farmer with this short code already exists for this stall.");
        }
        throw error;
      }

      const dto = toFarmerDto(created);
      writeAuditAndOutbox({
        tx,
        context,
        action: "farmer.created",
        targetType: "farmer",
        targetId: created.id,
        eventType: FARMER_CREATED_EVENT_TYPE,
        eventSchemaVersion: FARMER_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => farmerRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type UpdateFarmerCommandInput = UpdateFarmerRequest & { farmerId: string };

function updateFarmerDefinition(
  deps: CommandDeps,
): CommandDefinition<UpdateFarmerCommandInput, FarmerRecordDto> {
  return {
    type: "farmer.update",
    version: "1",
    requiredCapability: FARMER_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: UpdateFarmerCommandInput;
    }) => {
      const existing = getFarmerById(tx, context.stallId, input.farmerId);
      if (existing === null) {
        throw notFoundError("Farmer not found for this stall.");
      }

      const now = deps.now();
      updateFarmerWithExpectedRevision(tx, context.stallId, input.farmerId, {
        expectedRevision: input.expectedRevision,
        displayName: input.displayName,
        contactNumber: input.contactNumber,
        locality: input.locality,
        updatedAt: now,
      });

      const updated = getFarmerById(tx, context.stallId, input.farmerId);
      if (updated === null) {
        throw notFoundError("Farmer not found for this stall.");
      }
      const dto = toFarmerDto(updated);
      writeAuditAndOutbox({
        tx,
        context,
        action: "farmer.updated",
        targetType: "farmer",
        targetId: updated.id,
        eventType: FARMER_UPDATED_EVENT_TYPE,
        eventSchemaVersion: FARMER_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => farmerRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type ChangeFarmerStatusCommandInput = ChangeFarmerStatusRequest & { farmerId: string };

function changeFarmerStatusDefinition(
  deps: CommandDeps,
): CommandDefinition<ChangeFarmerStatusCommandInput, FarmerRecordDto> {
  return {
    type: "farmer.set_status",
    version: "1",
    requiredCapability: FARMER_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: ChangeFarmerStatusCommandInput;
    }) => {
      const existing = getFarmerById(tx, context.stallId, input.farmerId);
      if (existing === null) {
        throw notFoundError("Farmer not found for this stall.");
      }

      const now = deps.now();
      setFarmerActiveWithExpectedRevision(tx, context.stallId, input.farmerId, {
        expectedRevision: input.expectedRevision,
        isActive: input.status === "active",
        updatedAt: now,
      });

      const updated = getFarmerById(tx, context.stallId, input.farmerId);
      if (updated === null) {
        throw notFoundError("Farmer not found for this stall.");
      }
      const dto = toFarmerDto(updated);
      writeAuditAndOutbox({
        tx,
        context,
        action: "farmer.status_changed",
        targetType: "farmer",
        targetId: updated.id,
        eventType: FARMER_STATUS_CHANGED_EVENT_TYPE,
        eventSchemaVersion: FARMER_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => farmerRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export function runCreateFarmerCommand(
  deps: CommandDeps,
  input: CreateFarmerRequest,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): FarmerRecordDto {
  return runIdempotentCommand(deps, createFarmerDefinition(deps), {
    input: createFarmerRequestSchema.parse(input),
    ...meta,
  });
}

export function runUpdateFarmerCommand(
  deps: CommandDeps,
  input: UpdateFarmerCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): FarmerRecordDto {
  const { farmerId, ...body } = input;
  return runIdempotentCommand(deps, updateFarmerDefinition(deps), {
    input: { farmerId, ...updateFarmerRequestSchema.parse(body) },
    ...meta,
  });
}

export function runChangeFarmerStatusCommand(
  deps: CommandDeps,
  input: ChangeFarmerStatusCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): FarmerRecordDto {
  const { farmerId, ...body } = input;
  return runIdempotentCommand(deps, changeFarmerStatusDefinition(deps), {
    input: { farmerId, ...changeFarmerStatusRequestSchema.parse(body) },
    ...meta,
  });
}
