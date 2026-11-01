import type { DatabaseSync } from "node:sqlite";

export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionError";
  }
}

export class NestedTransactionError extends TransactionError {
  constructor(
    message = "Nested transactions are not supported. Finish the active transaction first.",
  ) {
    super(message);
    this.name = "NestedTransactionError";
  }
}

export class ClosedTransactionError extends TransactionError {
  constructor(message = "Transaction handle is closed and cannot be reused.") {
    super(message);
    this.name = "ClosedTransactionError";
  }
}

export class AsyncTransactionCallbackError extends TransactionError {
  constructor(
    message = "Transaction callbacks must be synchronous. Promises must not escape the transaction lifetime.",
  ) {
    super(message);
    this.name = "AsyncTransactionCallbackError";
  }
}

/**
 * Short-lived handle that exposes the active DatabaseSync while a transaction is open.
 * Access after commit/rollback throws ClosedTransactionError.
 */
export type TxHandle = {
  readonly db: DatabaseSync;
};

function createTxHandle(db: DatabaseSync): { handle: TxHandle; close: () => void } {
  let open = true;
  const handle: TxHandle = {
    get db(): DatabaseSync {
      if (!open) {
        throw new ClosedTransactionError();
      }
      return db;
    },
  };
  return {
    handle,
    close: () => {
      open = false;
    },
  };
}

function beginImmediate(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE;");
}

function commit(db: DatabaseSync): void {
  db.exec("COMMIT;");
}

function rollback(db: DatabaseSync): void {
  try {
    db.exec("ROLLBACK;");
  } catch {
    // Ignore when no transaction is open.
  }
}

/**
 * Run work inside a single exclusive SQLite write transaction.
 *
 * - Uses BEGIN IMMEDIATE (compatible with WAL + busy_timeout).
 * - Rejects nesting (no savepoints in this phase).
 * - Rejects Promise returns so async work cannot outlive the transaction.
 * - Invalidates the TxHandle after commit or rollback.
 */
export function runInTransaction<T>(db: DatabaseSync, fn: (tx: TxHandle) => T): T {
  if (db.isTransaction) {
    throw new NestedTransactionError();
  }

  beginImmediate(db);
  const { handle, close } = createTxHandle(db);

  try {
    const result = fn(handle);

    if (
      result !== null &&
      typeof result === "object" &&
      typeof (result as unknown as PromiseLike<unknown>).then === "function"
    ) {
      close();
      rollback(db);
      throw new AsyncTransactionCallbackError();
    }

    commit(db);
    close();
    return result;
  } catch (error) {
    close();
    rollback(db);
    throw error;
  }
}
