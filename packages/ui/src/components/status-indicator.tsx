import type { HTMLAttributes } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  CloudOff,
  Loader2,
  PauseCircle,
} from "lucide-react";

import { cn } from "../lib/utils.js";

export type StatusTone = "checking" | "available" | "unavailable" | "pending" | "error" | "unknown";

const toneStyles: Record<StatusTone, { className: string; Icon: typeof CheckCircle2 }> = {
  checking: {
    className: "bg-state-neutral-bg text-state-neutral",
    Icon: Loader2,
  },
  available: {
    className: "bg-state-success-bg text-state-success",
    Icon: CheckCircle2,
  },
  unavailable: {
    className: "bg-state-neutral-bg text-state-neutral",
    Icon: CloudOff,
  },
  pending: {
    className: "bg-state-warning-bg text-state-warning",
    Icon: PauseCircle,
  },
  error: {
    className: "bg-state-error-bg text-state-error",
    Icon: AlertCircle,
  },
  unknown: {
    className: "bg-state-info-bg text-state-info",
    Icon: CircleHelp,
  },
};

export interface StatusIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  tone: StatusTone;
  label: string;
}

function StatusIndicator({ tone, label, className, ...props }: StatusIndicatorProps) {
  const config = toneStyles[tone];
  const Icon = config.Icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-medium",
        config.className,
        className,
      )}
      role="status"
      {...props}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0", tone === "checking" && "animate-spin")}
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

export { StatusIndicator };
