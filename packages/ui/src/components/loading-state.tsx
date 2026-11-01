import type { HTMLAttributes } from "react";

import { cn } from "../lib/utils.js";
import { Skeleton } from "./skeleton.js";

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  rows?: number;
}

function LoadingState({ label = "Loading", rows = 3, className, ...props }: LoadingStateProps) {
  return (
    <div
      className={cn("space-y-3 rounded-lg border border-border bg-bg-surface p-6", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      {...props}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-4 w-full" />
      ))}
    </div>
  );
}

export { LoadingState };
