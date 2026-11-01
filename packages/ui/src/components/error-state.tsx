import type { HTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "./button.js";

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Try again",
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-state-error/30 bg-state-error-bg p-6 text-state-error",
        className,
      )}
      role="alert"
      {...props}
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {description ? <p className="text-sm">{description}</p> : null}
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export { ErrorState };
