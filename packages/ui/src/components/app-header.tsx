import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/utils.js";

export interface AppHeaderProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  actions?: ReactNode;
  leading?: ReactNode;
}

function AppHeader({ title, actions, leading, className, children, ...props }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-14 items-center gap-3 border-b border-border bg-bg-surface px-4 py-3",
        className,
      )}
      {...props}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export { AppHeader };
