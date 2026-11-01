import type { HTMLAttributes } from "react";

import { cn } from "../lib/utils.js";

export interface BrandMarkProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
}

function BrandMark({ compact = false, className, ...props }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md bg-bg-surface px-3 py-2 text-text-primary",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "font-semibold tracking-tight text-text-primary",
          compact ? "text-base" : "text-xl",
        )}
      >
        Polivo
      </span>
    </div>
  );
}

export { BrandMark };
