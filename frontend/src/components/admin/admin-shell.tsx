"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminNav } from "@/components/admin/admin-nav";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useWallet } from "@/hooks/useWallet";
import { ROLE_LIST } from "@/lib/admin/roles";

/**
 * Chrome for every /admin route: the access gate, the connected-wallet identity
 * strip (with the real on-chain roles it holds), the section navigation and the
 * page content.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const admin = useAdminRoles();
  const heldRoles = ROLE_LIST.filter((role) => admin.roles[role.key]);

  return (
    <AdminGuard>
      <div className="space-y-6" data-testid="admin-shell">
        <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Administrator</p>
              <p className="font-mono text-xs text-muted-foreground">
                {wallet.address ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {heldRoles.length ? (
              heldRoles.map((role) => (
                <Badge key={role.key} variant="muted" data-testid="admin-held-role">
                  {role.label}
                </Badge>
              ))
            ) : (
              <Badge variant="muted">No roles</Badge>
            )}
          </div>
        </div>

        <AdminNav />

        {admin.isSuperAdmin ? (
          <Alert variant="warning" title="Elevated privileges">
            This wallet holds DEFAULT_ADMIN_ROLE and can grant or revoke every
            other role.
          </Alert>
        ) : null}

        <div data-testid="admin-content">{children}</div>
      </div>
    </AdminGuard>
  );
}
