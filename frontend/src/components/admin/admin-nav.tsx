"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  Vote,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** true = active only on an exact match, false = prefix match. */
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/elections", label: "Elections", icon: Vote, exact: true },
  { href: "/admin/elections/create", label: "Create Election", icon: PlusCircle },
  { href: "/admin/candidates", label: "Candidates", icon: UserCheck },
  { href: "/admin/voters", label: "Voters", icon: Users },
  { href: "/admin/roles", label: "Roles", icon: ShieldCheck },
  { href: "/admin/security", label: "Security SOC", icon: ShieldAlert },
  { href: "/admin/audit", label: "Audit trail", icon: ScrollText },
];


export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      data-testid="admin-nav"
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`admin-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
