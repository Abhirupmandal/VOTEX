"use client";

/**
 * Administrative access gate (Phase 6 §3, §13, §18).
 *
 * Access is decided by REAL on-chain role membership (`useAdminRoles`), never by
 * "a wallet is connected". A connected wallet without an administrative role is
 * explicitly refused — the UI hides the console, and the on-chain `onlyRole`
 * guards remain the true security boundary regardless.
 */

import type { ReactNode } from "react";
import { ShieldAlert, Wallet } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useWallet } from "@/hooks/useWallet";

export interface AdminGuardProps {
  children: ReactNode;
}

function GateCard({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="mx-auto max-w-lg space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card/60 text-primary">
        {icon}
      </div>
      <CardTitle>{title}</CardTitle>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action ? <div className="flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function AccessDenied({ address }: { address?: string }) {
  return (
    <div data-testid="access-denied">
      <GateCard
        title="Access denied"
        description={
          address
            ? `Wallet ${address} does not hold an administrative role on this deployment. Access is decided by VotexAccessManager on-chain.`
            : "This wallet does not hold an administrative role on this deployment."
        }
        icon={<ShieldAlert className="h-6 w-6" />}
      />
    </div>
  );
}

export function AdminGuard({ children }: AdminGuardProps) {
  const wallet = useWallet();
  const admin = useAdminRoles();

  if (!wallet.isConnected) {
    return (
      <GateCard
        title="Connect an admin wallet"
        description="The Admin Control Center reads role membership directly from the chain. Connect the wallet that holds an administrative role."
        icon={<Wallet className="h-6 w-6" />}
        action={
          <Button onClick={wallet.connectWallet} disabled={!wallet.hasConnector}>
            Connect wallet
          </Button>
        }
      />
    );
  }

  if (wallet.isWrongNetwork) {
    return (
      <GateCard
        title="Wrong network"
        description={`This console targets ${wallet.targetNetworkName}. Your wallet is currently on ${wallet.networkName}.`}
        icon={<ShieldAlert className="h-6 w-6" />}
        action={
          <Button onClick={wallet.switchToVotexNetwork}>Switch network</Button>
        }
      />
    );
  }

  if (!admin.isLoaded) {
    return (
      <div className="space-y-3" data-testid="admin-guard-loading">
        <div className="h-8 w-56 animate-pulse rounded bg-card/60" />
        <div className="h-32 w-full animate-pulse rounded-lg bg-card/40" />
      </div>
    );
  }

  if (admin.error) {
    return (
      <Alert variant="danger" title="Unable to verify admin access">
        {admin.error.message}
      </Alert>
    );
  }

  if (!admin.hasAdminAccess) {
    return <AccessDenied address={wallet.shortAddress} />;
  }

  return <>{children}</>;
}
