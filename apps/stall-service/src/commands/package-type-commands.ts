import {
  PACKAGE_TYPE_CREATED_EVENT_TYPE,
  PACKAGE_TYPE_EVENT_SCHEMA_VERSION,
  PACKAGE_TYPE_STATUS_CHANGED_EVENT_TYPE,
  PACKAGE_TYPE_UPDATED_EVENT_TYPE,
  changePackageTypeStatusRequestSchema,
  createPackageTypeRequestSchema,
  packageTypeRecordSchema,
  packageTypeSnapshotEventPayloadSchema,
  updatePackageTypeRequestSchema,
  type ChangePackageTypeStatusRequest,
  type CreatePackageTypeRequest,
  type PackageTypeRecordDto,
  type UpdatePackageTypeRequest,
} from "@polivo/contracts";
import {
  classifySqliteError,
  getPackageTypeById,
  insertPackageType,
  setPackageTypeActiveWithExpectedRevision,
  updatePackageTypeWithExpectedRevision,
  type PackageTypeRecord,
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
import { CATALOG_MANAGE_CAPABILITY } from "./vegetable-commands.js";

export function toPackageTypeDto(record: PackageTypeRecord): PackageTypeRecordDto {
  return packageTypeRecordSchema.parse({
    id: record.id,
    shortCode: record.shortCode,
    displayName: record.displayName,
    isActive: record.isActive,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function snapshotPayload(packageType: PackageTypeRecordDto, stallId: string) {
  return packageTypeSnapshotEventPayloadSchema.parse({ packageType, stallId });
}

function createPackageTypeDefinition(
  deps: CommandDeps,
): CommandDefinition<CreatePackageTypeRequest, PackageTypeRecordDto> {
  return {
    type: "package_type.create",
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
      input: CreatePackageTypeRequest;
    }) => {
      const now = deps.now();
      const id = deps.createId();
      let created: PackageTypeRecord;
      try {
        created = insertPackageType(tx, {
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
          throw conflictError("A package type with this short code already exists for this stall.");
        }
        throw error;
      }

      const dto = toPackageTypeDto(created);
      writeAuditAndOutbox({
        tx,
        context,
        action: "package_type.created",
        targetType: "package_type",
        targetId: created.id,
        eventType: PACKAGE_TYPE_CREATED_EVENT_TYPE,
        eventSchemaVersion: PACKAGE_TYPE_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => packageTypeRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type UpdatePackageTypeCommandInput = UpdatePackageTypeRequest & { packageTypeId: string };

function updatePackageTypeDefinition(
  deps: CommandDeps,
): CommandDefinition<UpdatePackageTypeCommandInput, PackageTypeRecordDto> {
  return {
    type: "package_type.update",
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
      input: UpdatePackageTypeCommandInput;
    }) => {
      const existing = getPackageTypeById(tx, context.stallId, input.packageTypeId);
      if (existing === null) {
        throw notFoundError("Package type not found for this stall.");
      }

      const now = deps.now();
      updatePackageTypeWithExpectedRevision(tx, context.stallId, input.packageTypeId, {
        expectedRevision: input.expectedRevision,
        displayName: input.displayName,
        updatedAt: now,
      });

      const updated = getPackageTypeById(tx, context.stallId, input.packageTypeId);
      if (updated === null) {
        throw notFoundError("Package type not found for this stall.");
      }
      const dto = toPackageTypeDto(updated);
      writeAuditAndOutbox({
        tx,
        context,
        action: "package_type.updated",
        targetType: "package_type",
        targetId: updated.id,
        eventType: PACKAGE_TYPE_UPDATED_EVENT_TYPE,
        eventSchemaVersion: PACKAGE_TYPE_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => packageTypeRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type ChangePackageTypeStatusCommandInput = ChangePackageTypeStatusRequest & {
  packageTypeId: string;
};

function changePackageTypeStatusDefinition(
  deps: CommandDeps,
): CommandDefinition<ChangePackageTypeStatusCommandInput, PackageTypeRecordDto> {
  return {
    type: "package_type.set_status",
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
      input: ChangePackageTypeStatusCommandInput;
    }) => {
      const existing = getPackageTypeById(tx, context.stallId, input.packageTypeId);
      if (existing === null) {
        throw notFoundError("Package type not found for this stall.");
      }

      const now = deps.now();
      setPackageTypeActiveWithExpectedRevision(tx, context.stallId, input.packageTypeId, {
        expectedRevision: input.expectedRevision,
        isActive: input.status === "active",
        updatedAt: now,
      });

      const updated = getPackageTypeById(tx, context.stallId, input.packageTypeId);
      if (updated === null) {
        throw notFoundError("Package type not found for this stall.");
      }
      const dto = toPackageTypeDto(updated);
      writeAuditAndOutbox({
        tx,
        context,
        action: "package_type.status_changed",
        targetType: "package_type",
        targetId: updated.id,
        eventType: PACKAGE_TYPE_STATUS_CHANGED_EVENT_TYPE,
        eventSchemaVersion: PACKAGE_TYPE_EVENT_SCHEMA_VERSION,
        payload: snapshotPayload(dto, context.stallId),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });
      return dto;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => packageTypeRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export function runCreatePackageTypeCommand(
  deps: CommandDeps,
  input: CreatePackageTypeRequest,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): PackageTypeRecordDto {
  return runIdempotentCommand(deps, createPackageTypeDefinition(deps), {
    input: createPackageTypeRequestSchema.parse(input),
    ...meta,
  });
}

export function runUpdatePackageTypeCommand(
  deps: CommandDeps,
  input: UpdatePackageTypeCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): PackageTypeRecordDto {
  const { packageTypeId, ...body } = input;
  return runIdempotentCommand(deps, updatePackageTypeDefinition(deps), {
    input: { packageTypeId, ...updatePackageTypeRequestSchema.parse(body) },
    ...meta,
  });
}

export function runChangePackageTypeStatusCommand(
  deps: CommandDeps,
  input: ChangePackageTypeStatusCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): PackageTypeRecordDto {
  const { packageTypeId, ...body } = input;
  return runIdempotentCommand(deps, changePackageTypeStatusDefinition(deps), {
    input: { packageTypeId, ...changePackageTypeStatusRequestSchema.parse(body) },
    ...meta,
  });
}
