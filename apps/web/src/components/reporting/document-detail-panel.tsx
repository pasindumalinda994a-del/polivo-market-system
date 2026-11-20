"use client";

import { ErrorState } from "@polivo/ui";
import { useEffect, useRef, useState } from "react";

import { FreshnessBanner } from "./freshness-banner";

type BillPayload = {
  bill: {
    billNumber: string | null;
    businessDate: string | null;
    status: string;
    totalAmountMinor: number | null;
  };
};

type PaymentPayload = {
  payment: {
    referenceNumber: string;
    businessDate: string;
    status: string;
    method: string;
    direction: string;
    amountMinor: number;
  };
};

export function DocumentDetailPanel(
  props:
    | { tenantId: string; kind: "bill"; billKind: "trader_bill" | "farmer_bill"; id: string }
    | { tenantId: string; kind: "payment"; id: string },
) {
  const [state, setState] = useState<"loading" | "denied" | "error" | "ready">("loading");
  const [detail, setDetail] = useState<string>("");
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    const path =
      props.kind === "bill"
        ? `/api/tenants/${encodeURIComponent(props.tenantId)}/bills/${encodeURIComponent(props.billKind)}/${encodeURIComponent(props.id)}`
        : `/api/tenants/${encodeURIComponent(props.tenantId)}/payments/${encodeURIComponent(props.id)}`;
    void (async () => {
      // Yield so setState is not synchronous from this effect.
      await Promise.resolve();
      if (current !== generation.current) {
        return;
      }
      setState("loading");
      const response = await fetch(path, { cache: "no-store" });
      if (current !== generation.current) {
        return;
      }
      if (response.status === 401 || response.status === 403) {
        setState("denied");
        return;
      }
      if (!response.ok) {
        setState("error");
        return;
      }
      const json = (await response.json()) as BillPayload | PaymentPayload;
      if (current !== generation.current) {
        return;
      }
      if (props.kind === "bill" && "bill" in json) {
        const bill = json.bill;
        setDetail(
          `${bill.billNumber ?? props.id} · ${bill.businessDate ?? "—"} · ${bill.status} · LKR ${((bill.totalAmountMinor ?? 0) / 100).toFixed(2)}`,
        );
      } else if ("payment" in json) {
        const payment = json.payment;
        setDetail(
          `${payment.referenceNumber} · ${payment.businessDate} · ${payment.method} ${payment.direction} · LKR ${(payment.amountMinor / 100).toFixed(2)} (${payment.status})`,
        );
      }
      setState("ready");
    })();
  }, [props]);

  useEffect(() => {
    generation.current += 1;
  }, [props.tenantId]);

  return (
    <div className="space-y-4">
      <FreshnessBanner tenantId={props.tenantId} />
      {state === "loading" ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {state === "denied" || state === "error" ? (
        <ErrorState title="Document unavailable" description="Not found or access denied." />
      ) : null}
      {state === "ready" ? <p className="text-lg font-medium">{detail}</p> : null}
    </div>
  );
}
