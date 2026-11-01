"use client";

import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/utils.js";

export interface SidebarNavItem {
  id: string;
  label: string;
  href?: string;
  available?: boolean;
  active?: boolean;
  icon?: ReactNode;
}

export interface SidebarNavProps extends HTMLAttributes<HTMLElement> {
  items: SidebarNavItem[];
  compact?: boolean;
  onNavigate?: (item: SidebarNavItem) => void;
}

function SidebarNav({ items, compact = false, onNavigate, className, ...props }: SidebarNavProps) {
  return (
    <nav aria-label="Primary" className={cn("flex flex-col gap-1", className)} {...props}>
      {items.map((item) => {
        const isAvailable = item.available !== false && Boolean(item.href);
        const content = (
          <>
            {item.icon ? (
              <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            <span className={cn(compact && "md:sr-only")}>{item.label}</span>
            {!isAvailable ? (
              <span
                className={cn(
                  "ml-auto text-xs font-normal text-text-inverse/70",
                  compact && "md:sr-only",
                )}
              >
                Soon
              </span>
            ) : null}
          </>
        );

        const itemClassName = cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-[15px] font-medium leading-6 transition-colors",
          item.active
            ? "bg-bg-selected text-text-primary"
            : "text-text-inverse/90 hover:bg-white/10 hover:text-text-inverse",
          !isAvailable && "cursor-not-allowed opacity-70 hover:bg-transparent",
        );

        if (!isAvailable) {
          return (
            <span
              key={item.id}
              className={itemClassName}
              aria-disabled="true"
              title={`${item.label} is not available yet`}
            >
              {content}
            </span>
          );
        }

        if (onNavigate) {
          return (
            <button
              key={item.id}
              type="button"
              className={cn(itemClassName, "w-full text-left")}
              aria-current={item.active ? "page" : undefined}
              onClick={() => {
                onNavigate(item);
              }}
            >
              {content}
            </button>
          );
        }

        return (
          <a
            key={item.id}
            href={item.href}
            className={itemClassName}
            aria-current={item.active ? "page" : undefined}
          >
            {content}
          </a>
        );
      })}
    </nav>
  );
}

export { SidebarNav };
