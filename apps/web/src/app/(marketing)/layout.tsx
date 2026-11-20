import type { ReactNode } from "react";

import { PublicSiteShell } from "@/components/public-site-shell";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <PublicSiteShell>{children}</PublicSiteShell>;
}
