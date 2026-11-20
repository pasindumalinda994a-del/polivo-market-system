"use client";

import { useEffect, useRef, useState } from "react";

type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "denied" }
  | { status: "error"; message: string };

export function useTenantJson<T>(tenantId: string, path: string, enabled = true): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: "idle" });
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    if (!enabled) {
      return;
    }
    void (async () => {
      await Promise.resolve();
      if (current !== generation.current) {
        return;
      }
      setState({ status: "loading" });
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}${path}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (current !== generation.current) {
        return;
      }
      if (response.status === 401 || response.status === 403) {
        setState({ status: "denied" });
        return;
      }
      if (!response.ok) {
        setState({ status: "error", message: "Unable to load reporting data." });
        return;
      }
      const data = (await response.json()) as T;
      if (current !== generation.current) {
        return;
      }
      setState({ status: "ready", data });
    })();
  }, [enabled, path, tenantId]);

  if (!enabled) {
    return { status: "idle" };
  }

  return state;
}
