"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, Vote } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateElectionForm } from "@/components/admin/create-election-form";
import { useAdminElections } from "@/hooks/useAdminElections";
import { useElections } from "@/hooks/useElections";
import { compareConsistency } from "@/lib/admin/consistency";
import { statePresentation } from "@/lib/elections";
import { formatTimestamp, shortenAddress } from "@/lib/formatting";

function stateTone(stateName: string): "default" | "success" | "warning" | "muted" {
  switch (stateName) {
    case "ACTIVE":
    case "REGISTRATION":
      return "success";
    case "PAUSED":
      return "warning";
    case "RESULTS_FINALIZED":
      return "default";
    default:
      return "muted";
  }
}

/** Election management (§7): on-chain listing + creation, with index comparison. */
export default function AdminElectionsPage() {
  const onChain = useAdminElections();
  const indexed = useElections({ pageSize: 100 });

  const consistency = useMemo(
    () =>
      compareConsistency([
        {
          field: "Election count",
          onChain: onChain.counts.total,
          indexed: indexed.isLoading ? null : indexed.total,
        },
      ]),
    [onChain.counts.total, indexed.total, indexed.isLoading],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Election Manager"
        title="Elections"
        description="Enumerated directly from the ElectionFactory via totalElections / getElectionAt. The indexer is shown only for comparison."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/admin/elections/create">
                <ArrowUpRight className="h-4 w-4" />
                Create election
              </Link>
            </Button>
            <Button variant="outline" onClick={onChain.refetch}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </Button>
          </div>
        }

      />

      {onChain.error ? (
        <Alert variant="danger" title="On-chain read failed">
          {onChain.error.message}
        </Alert>
      ) : null}

      {!consistency.consistent ? (
        <Alert variant="warning" title="DATA CONSISTENCY WARNING" data-testid="consistency-warning">
          The backend index reports {indexed.total} election(s) while the chain
          reports {onChain.counts.total}. The blockchain is authoritative — trust
          the on-chain list below. The indexer may simply be catching up.
        </Alert>
      ) : null}

      <CreateElectionForm onCreated={onChain.refetch} />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          On-chain elections ({onChain.counts.total})
        </h2>

        {onChain.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : onChain.elections.length === 0 ? (
          <EmptyState
            icon={<Vote className="h-8 w-8" />}
            title="No elections on-chain"
            description="Create the first election above. Once the transaction confirms, it will appear here in the DRAFT state."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {onChain.elections.map((row) => (
              <Card key={row.electionId} className="flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{row.electionId}
                    </span>
                    <h3 className="truncate font-semibold">{row.title || "Untitled"}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{shortenAddress(row.address)}</span>
                    <span>·</span>
                    <span>{row.totalRegisteredVoters} registered</span>
                    <span>·</span>
                    <span>{row.totalVotes} votes</span>
                    <span>·</span>
                    <span>voting closes {formatTimestamp(row.votingEnd)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={stateTone(row.stateName)}>
                    {statePresentation(row.stateName).label}
                  </Badge>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/elections/${row.electionId}`}>
                      Manage
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
