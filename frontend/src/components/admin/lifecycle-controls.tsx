"use client";

import type { Address } from "viem";
import { ArrowRight, CalendarClock, Flag, PlayCircle, Rocket } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { TransactionStatus } from "@/components/admin/transaction-status";
import { useElectionLifecycle, type LifecycleAction } from "@/hooks/useElectionAdmin";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { statePresentation } from "@/lib/elections";

interface Transition {
  action: LifecycleAction;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** The single next legal transition for each lifecycle state. */
const NEXT_BY_STATE: Record<string, Transition | undefined> = {
  DRAFT: {
    action: "openRegistration",
    label: "Open registration",
    description: "Move the election into the REGISTRATION phase so voters can enrol.",
    icon: CalendarClock,
  },
  REGISTRATION: {
    action: "startElection",
    label: "Start election",
    description: "Close registration and open voting (state becomes ACTIVE).",
    icon: Rocket,
  },
  ACTIVE: {
    action: "endElection",
    label: "End election",
    description: "Stop accepting votes and mark the election ENDED.",
    icon: Flag,
  },
  ENDED: {
    action: "finalizeResults",
    label: "Finalize results",
    description: "Permanently record the outcome (RESULTS_FINALIZED).",
    icon: PlayCircle,
  },
  RESULTS_FINALIZED: undefined,
};

export interface LifecycleControlsProps {
  electionId: number;
  electionAddress: Address | undefined;
  stateName: string;
  onChanged?: () => void;
}

/** Election Manager lifecycle transitions against the deployed instance (§7). */
export function LifecycleControls({
  electionId,
  electionAddress,
  stateName,
  onChanged,
}: LifecycleControlsProps) {
  const admin = useAdminRoles();
  const tx = useElectionLifecycle();

  const next = NEXT_BY_STATE[stateName];
  const canManage = admin.roles.ELECTION_MANAGER_ROLE;
  const presentation = statePresentation(stateName);

  const handleAction = async (action: LifecycleAction) => {
    if (!electionAddress) return;
    const ok = await tx.runAction(action, electionAddress, electionId);
    if (ok) onChanged?.();
  };

  return (
    <Card className="space-y-4" data-testid="lifecycle-controls">
      <CardTitle className="flex items-center gap-2">
        <ArrowRight className="h-5 w-5 text-primary" aria-hidden />
        Lifecycle
      </CardTitle>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Current state</span>
        <span className="font-medium">{presentation.label}</span>
      </div>

      {!canManage ? (
        <Alert variant="warning" title="Election Manager role required">
          Lifecycle transitions are guarded by `onlyRole(ELECTION_MANAGER_ROLE)`.
        </Alert>
      ) : null}

      {next ? (
        <div className="space-y-3">
          <div className="rounded-md border border-border/60 bg-card/40 p-3 text-sm">
            <p className="font-medium">{next.label}</p>
            <p className="text-xs text-muted-foreground">{next.description}</p>
          </div>
          <Button
            onClick={() => handleAction(next.action)}
            disabled={!canManage || tx.isBusy || !electionAddress}
            data-testid={`lifecycle-${next.action}`}
          >
            <next.icon className="h-4 w-4" />
            {tx.isBusy && tx.activeAction === next.action ? "Submitting…" : next.label}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This election has reached a terminal state. No further lifecycle
          transitions are available.
        </p>
      )}

      <TransactionStatus
        status={tx.status}
        txHash={tx.txHash}
        receipt={tx.receipt}
        error={tx.error}
      />
    </Card>
  );
}
