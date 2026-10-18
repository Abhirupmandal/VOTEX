import type { ReactNode } from "react";

import { SiteHeader } from "@/components/layout/site-header";
import { WrongNetworkBanner } from "@/components/wallet/wrong-network-banner";
import { Footer } from "@/components/landing/footer";

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Standard inner-page chrome: header, wrong-network banner, content, footer.
 * The landing page composes the same pieces explicitly for a distinct hero.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <SiteHeader />
      <WrongNetworkBanner />
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-12 tabular-nums focus:outline-none"
      >
        {children}
      </main>
      <Footer />
    </div>
  );
}
