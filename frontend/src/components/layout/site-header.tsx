"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { WalletStatus } from "@/components/wallet/wallet-status";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/elections", label: "Elections" },
  { href: "/audit", label: "Audit" },
] as const;

/** Fixed site header with primary navigation and the wallet control. */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          aria-label="VOTEX home"
        >
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="text-lg">VOTEX</span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-card/60",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <WalletStatus />
      </div>
    </header>
  );
}
