import type { AnchorHTMLAttributes } from "react";

import { cn } from "../lib/utils.js";

export interface SkipLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  targetId?: string;
}

function SkipLink({
  targetId = "main-content",
  className,
  children = "Skip to content",
  ...props
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-focus-gap",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export { SkipLink };
