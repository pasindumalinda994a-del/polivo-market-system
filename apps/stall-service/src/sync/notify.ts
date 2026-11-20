type WakeListener = () => void;

const listeners = new Set<WakeListener>();

/** Wake the upload worker after a local transaction commits outbox events. */
export function notifySyncOutboxCommitted(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Wake listeners must not affect local transaction success.
    }
  }
}

export function subscribeSyncOutboxWake(listener: WakeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
