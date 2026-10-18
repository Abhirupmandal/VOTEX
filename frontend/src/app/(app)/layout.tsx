import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

/**
 * Layout for all inner application routes.
 *
 * The landing page lives outside this group so it can render its own hero
 * without the standard chrome. Everything else (elections, audit, results)
 * shares the header, wrong-network banner, and footer.
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
