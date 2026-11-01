"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";

import { cn } from "../lib/utils.js";
import { BrandMark } from "./brand-mark.js";
import { Button } from "./button.js";
import { SidebarNav, type SidebarNavItem } from "./sidebar-nav.js";
import { SkipLink } from "./skip-link.js";

export interface AppShellProps {
  navigation: SidebarNavItem[];
  header?: React.ReactNode;
  statusArea?: React.ReactNode;
  children: React.ReactNode;
  brand?: React.ReactNode;
  compactNav?: boolean;
  className?: string;
  mainId?: string;
  onNavigate?: (item: SidebarNavItem) => void;
}

function AppShell({
  navigation,
  header,
  statusArea,
  children,
  brand,
  compactNav = false,
  className,
  mainId = "main-content",
  onNavigate,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  function handleNavigate(item: SidebarNavItem) {
    setMobileOpen(false);
    onNavigate?.(item);
  }

  return (
    <div className={cn("flex min-h-screen bg-bg-base text-foreground", className)}>
      <SkipLink targetId={mainId} />

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-bg-navigation/40 md:hidden"
          aria-label="Close navigation overlay"
          onClick={() => {
            setMobileOpen(false);
          }}
        />
      ) : null}

      <aside
        id="app-shell-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-bg-navigation text-text-inverse transition-transform md:static md:translate-x-0",
          compactNav ? "md:w-20" : "md:w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
        aria-label="Application"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 p-3">
          {brand ?? <BrandMark compact={compactNav} />}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-text-inverse hover:bg-white/10 md:hidden"
            aria-label="Close navigation"
            onClick={() => {
              setMobileOpen(false);
            }}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav
            items={navigation}
            compact={compactNav}
            onNavigate={onNavigate ? handleNavigate : undefined}
          />
        </div>
        {statusArea ? (
          <div className="border-t border-white/10 p-3 text-sm text-text-inverse/90">
            {statusArea}
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-bg-surface px-3 py-2 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="app-shell-sidebar"
            onClick={() => {
              setMobileOpen(true);
            }}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          {brand ?? <BrandMark compact />}
        </div>
        {header}
        <main id={mainId} className="min-h-0 flex-1 overflow-auto p-4 md:p-6" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

export { AppShell };
