import {
  VEGETABLE_CREATED_EVENT_TYPE,
  VEGETABLE_EVENT_SCHEMA_VERSION,
  VEGETABLE_STATUS_CHANGED_EVENT_TYPE,
  VEGETABLE_UPDATED_EVENT_TYPE,
  changeVegetableStatusRequestSchema,
  createVegetableRequestSchema,
  updateVegetableRequestSchema,
  vegetableRecordSchema,
  vegetableSnapshotEventPayloadSchema,
  type ChangeVegetableStatusRequest,
  type CreateVegetableRequest,
  type UpdateVegetableRequest,
  type VegetableRecordDto,
} from "@polivo/contracts";
import {
  classifySqliteError,
  getVegetableById,
  insertVegetable,
  setVegetableActiveWithExpectedRevision,
  updateVegetableWithExpectedRevision,
  type TxHandle,
  type VegetableRecord,
} from "@polivo/db-local";

import type { ExecutionContext } from "../context/execution-context.js";
import { conflictError, notFoundError } from "../errors/app-error.js";
import {
  runIdempotentCommand,
  writeAuditAndOutbox,
  type CommandDefinition,
  type CommandDeps,
} from "./command-runner.js";

export const CATALOG_MANAGE_CAPABILITY = "catalog.manage";

export function toVegetableDto(record: VegetableRecord): VegetableRecordDto {
  return vegetableRecordSchema.parse({
    id: record.id,
    shortCode: record.shortCode,
    displayName: record.displayName,
    isActive: record.isActive,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function snapshotPayload(vegetable: VegetableRecordDto, stallId: string) {
  return vegetableSnapshotEventPayloadSchema.parse({ vegetable, stallId });
}

function createVegetableDefinition(
  deps: CommandDeps,
): CommandDefinition<CreateVegetableRequest, VegetableRecordDto> {
  return {
    type: "vegetable.create",
    version: "1",
    requiredCapability: CATALOG_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: CreateVegetableRequest;
    }) => {
      const now = deps.now();
      const id = deps.createId();
      let created: VegetableRecord;
      try {
        created = insertVegetable(tx, {
          id,
          stallId: context.stallId,
          shortCode: input.shortCode,
          displayName: input.displayName,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        const classified = classifySqliteError(error);
        if (classified.kind === "unique_constraint") {
          throw conflictError("A vegetable with this short code already exists for this stall.");
        }
        throw error;
      }

      const dto = toVegetableDto(created);
      writeAuditAndOutbox({
        tx,
        context,
        action: "vegetable.created",
        targetType: "vegetable",
        targetId: created.id,
        eventType: VEGETABLE_CREATED_EVENT_TYPE,
        eventSchemaVersion: VEGETABLE_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => vegetableRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type UpdateVegetableCommandInput = UpdateVegetableRequest & { vegetableId: string };

function updateVegetableDefinition(
  deps: CommandDeps,
): CommandDefinition<UpdateVegetableCommandInput, VegetableRecordDto> {
  return {
    type: "vegetable.update",
    version: "1",
    requiredCapability: CATALOG_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: UpdateVegetableCommandInput;
    }) => {
      const existing = getVegetableById(tx, context.stallId, input.vegetableId);
      if (existing === null) {
        throw notFoundError("Vegetable not found for this stall.");
      }

      const now = deps.now();
      updateVegetableWithExpectedRevision(tx, context.stallId, input.vegetableId, {
        expectedRevision: input.expectedRevision,
        displayName: input.displayName,
        updatedAt: now,
      });

      const updated = getVegetableById(tx, context.stallId, input.vegetableId);
      if (updated === null) {
        throw notFoundError("Vegetable not found for this stall.");
      }
      const dto = toVegetableDto(updated);
      writeAuditAndOutbox({
        tx,
        context,
        action: "vegetable.updated",
        targetType: "vegetable",
        targetId: updated.id,
        eventType: VEGETABLE_UPDATED_EVENT_TYPE,
        eventSchemaVersion: VEGETABLE_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => vegetableRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type ChangeVegetableStatusCommandInput = ChangeVegetableStatusRequest & {
  vegetableId: string;
};

function changeVegetableStatusDefinition(
  deps: CommandDeps,
): CommandDefinition<ChangeVegetableStatusCommandInput, VegetableRecordDto> {
  return {
    type: "vegetable.set_status",
    version: "1",
    requiredCapability: CATALOG_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: ChangeVegetableStatusCommandInput;
    }) => {
      const existing = getVegetableById(tx, context.stallId, input.vegetableId);
      if (existing === null) {
        throw notFoundError("Vegetable not found for this stall.");
      }

      const now = deps.now();
      setVegetableActiveWithExpectedRevision(tx, context.stallId, input.vegetableId, {
        expectedRevision: input.expectedRevision,
        isActive: input.status === "active",
        updatedAt: now,
      });

      const updated = getVegetableById(tx, context.stallId, input.vegetableId);
      if (updated === null) {
        throw notFoundError("Vegetable not found for this stall.");
      }
      const dto = toVegetableDto(updated);
      writeAuditAndOutbox({
        tx,
        context,
        action: "vegetable.status_changed",
        targetType: "vegetable",
        targetId: updated.id,
        eventType: VEGETABLE_STATUS_CHANGED_EVENT_TYPE,
        eventSchemaVersion: VEGETABLE_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => vegetableRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export function runCreateVegetableCommand(
  deps: CommandDeps,
  input: CreateVegetableRequest,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): VegetableRecordDto {
  return runIdempotentCommand(deps, createVegetableDefinition(deps), {
    input: createVegetableRequestSchema.parse(input),
    ...meta,
  });
}

export function runUpdateVegetableCommand(
  deps: CommandDeps,
  input: UpdateVegetableCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): VegetableRecordDto {
  const { vegetableId, ...body } = input;
  return runIdempotentCommand(deps, updateVegetableDefinition(deps), {
    input: { vegetableId, ...updateVegetableRequestSchema.parse(body) },
    ...meta,
  });
}

export function runChangeVegetableStatusCommand(
  deps: CommandDeps,
  input: ChangeVegetableStatusCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): VegetableRecordDto {
  const { vegetableId, ...body } = input;
  return runIdempotentCommand(deps, changeVegetableStatusDefinition(deps), {
    input: { vegetableId, ...changeVegetableStatusRequestSchema.parse(body) },
    ...meta,
  });
}
