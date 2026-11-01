import type { DatabaseSync } from "node:sqlite";

/** Accept LocalDatabase, TxHandle, or a raw DatabaseSync wrapper. */
export type DbExecutor = {
  readonly db: DatabaseSync;
};

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

export class NotFoundError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class RevisionConflictError extends RepositoryError {
  constructor(message = "The record was modified by another command.") {
    super(message);
    this.name = "RevisionConflictError";
  }
}

export class SequenceConfigurationError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = "SequenceConfigurationError";
  }
}
