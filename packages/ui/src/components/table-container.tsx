import type { HTMLAttributes } from "react";

import { cn } from "../lib/utils.js";

export interface TableContainerProps extends HTMLAttributes<HTMLDivElement> {
  caption?: string;
}

function TableContainer({ caption, className, children, ...props }: TableContainerProps) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg border border-border bg-bg-surface",
        className,
      )}
      {...props}
    >
      {caption ? (
        <div className="border-b border-border px-4 py-3 text-sm font-medium text-muted-foreground">
          {caption}
        </div>
      ) : null}
      <div className="w-full overflow-x-auto">{children}</div>
    </div>
  );
}

export { TableContainer };
