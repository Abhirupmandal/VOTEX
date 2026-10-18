"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { Search, ShieldCheck, ShieldMinus, ShieldPlus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormField, inputClassName } from "@/components/admin/form-field";
import { TransactionStatus } from "@/components/admin/transaction-status";
import { useAdminRoles, useRoleMembership } from "@/hooks/useAdminRoles";
import { useRoleAdmin } from "@/hooks/useRoleAdmin";
import { validateAddress } from "@/lib/admin/validation";
import { ROLES, ROLE_LIST, type RoleKey } from "@/lib/admin/roles";
import { shortenAddress } from "@/lib/formatting";

/**
 * Role management (§13).
 *
 * grantRole / revokeRole are REAL OpenZeppelin calls against the deployed
 * VotexAccessManager. Only a wallet holding DEFAULT_ADMIN_ROLE can succeed
 * on-chain; the UI gate is UX, the contract guard is the boundary.
 */
export default function AdminRolesPage() {
  const admin = useAdminRoles();
  const tx = useRoleAdmin();

  const [roleKey, setRoleKey] = useState<RoleKey>("ELECTION_MANAGER_ROLE");
  const [account, setAccount] = useState("");
  const [touched, setTouched] = useState(false);

  const [lookupInput, setLookupInput] = useState("");
  const [lookupAccount, setLookupAccount] = useState<Address | undefined>(undefined);
  const membership = useRoleMembership(lookupAccount);

  const validation = useMemo(() => validateAddress(account), [account]);
  const canManage = admin.isSuperAdmin;

  const run = async (mode: "grant" | "revoke") => {
    setTouched(true);
    if (!validation.valid) return;
    const role = ROLES[roleKey];
    const target = account.trim() as Address;
    const ok =
      mode === "grant"
        ? await tx.grantRole(role.hash, target)
        : await tx.revokeRole(role.hash, target);
    if (ok) {
      setAccount("");
      setTouched(false);
      admin.refresh();
      if (lookupAccount && lookupAccount.toLowerCase() === target.toLowerCase()) {
        membership.refetch();
      }
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Default Admin"
        title="Roles"
        description="Grant and revoke VOTEX roles through the deployed VotexAccessManager. Membership shown here is read from the chain — never inferred from connection state."
      />

      {!canManage ? (
        <Alert variant="warning" title="DEFAULT_ADMIN_ROLE required">
          Granting or revoking a role calls `grantRole`/`revokeRole`, which require
          DEFAULT_ADMIN_ROLE. Only the super-admin wallet can perform these writes.
        </Alert>
      ) : null}

      {/* Catalogue */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ROLE_LIST.map((role) => (
          <Card key={role.key} className="space-y-2" data-testid={`role-card-${role.key}`}>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{role.label}</CardTitle>
              <Badge variant={role.stateChanging ? "default" : "muted"}>
                {role.stateChanging ? "State-changing" : "Read-only"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{role.description}</p>
            <code className="block break-all font-mono text-[10px] text-muted-foreground">
              {role.hash}
            </code>
            {admin.roles[role.key] ? (
              <Badge variant="success" data-testid={`role-held-${role.key}`}>
                You hold this role
              </Badge>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Grant / revoke */}
        <Card className="space-y-5" data-testid="role-admin-form">
          <CardTitle className="flex items-center gap-2">
            <ShieldPlus className="h-5 w-5 text-primary" aria-hidden />
            Grant or revoke
          </CardTitle>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
            <FormField label="Role" htmlFor="ra-role" required>
              <select
                id="ra-role"
                data-testid="ra-role"
                className={inputClassName}
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value as RoleKey)}
              >
                {ROLE_LIST.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Account"
              htmlFor="ra-account"
              required
              error={touched ? validation.errors.address : undefined}
              hint="The wallet address that will receive or lose the role."
            >
              <input
                id="ra-account"
                data-testid="ra-account"
                className={inputClassName}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
            </FormField>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!canManage || tx.isBusy || (touched && !validation.valid)}
                onClick={() => run("grant")}
                data-testid="grant-role-submit"
              >
                <ShieldPlus className="h-4 w-4" />
                {tx.isBusy ? "Submitting…" : "Grant"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canManage || tx.isBusy || (touched && !validation.valid)}
                onClick={() => run("revoke")}
                data-testid="revoke-role-submit"
              >
                <ShieldMinus className="h-4 w-4" />
                Revoke
              </Button>
            </div>
          </form>

          <TransactionStatus
            status={tx.status}
            txHash={tx.txHash}
            receipt={tx.receipt}
            error={tx.error}
          />
        </Card>

        {/* Membership matrix */}
        <Card className="space-y-5" data-testid="role-membership">
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" aria-hidden />
            Check an account
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Read-only. Queries `hasRole` for every VOTEX role directly from the
            deployed access manager.
          </p>

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setLookupAccount((lookupInput.trim() as Address) || undefined);
            }}
          >
            <FormField label="Account" htmlFor="rm-account" className="flex-1">
              <input
                id="rm-account"
                className={inputClassName}
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
            </FormField>
            <Button type="submit" variant="outline" data-testid="role-membership-submit">
              <Search className="h-4 w-4" />
              Check
            </Button>
          </form>

          {lookupAccount ? (
            <div className="space-y-3" data-testid="role-membership-result">
              <p className="font-mono text-sm">{shortenAddress(lookupAccount)}</p>
              <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                {ROLE_LIST.map((role) => (
                  <li
                    key={role.key}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span>{role.label}</span>
                    {membership.isLoading ? (
                      <span className="text-xs text-muted-foreground">…</span>
                    ) : (
                      <Badge variant={membership.roles[role.key] ? "success" : "muted"}>
                        {membership.roles[role.key] ? "Granted" : "Not held"}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
              {membership.error ? (
                <Alert variant="warning" title="Could not read membership">
                  {membership.error.message}
                </Alert>
              ) : null}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Enter an account to inspect its on-chain role membership.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
