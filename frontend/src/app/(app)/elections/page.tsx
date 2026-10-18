"use client";

import { useMemo, useState } from "react";
import { Boxes, RefreshCw, Vote, Activity } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { ElectionCard } from "@/components/elections/election-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useBlockchain, useElections } from "@/hooks";
import { ELECTION_STATES } from "@/types";
import { cn } from "@/lib/utils";

const FILTERS = ["ALL", ...ELECTION_STATES] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  ALL: "All",
  DRAFT: "Draft",
  REGISTRATION: "Registration",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ENDED: "Ended",
  RESULTS_FINALIZED: "Finalized",
};

/** Election dashboard (§6): lists elections discovered via the indexer. */
export default function ElectionsPage() {
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const blockchain = useBlockchain();

  const queryState = filter === "ALL" ? undefined : filter;
  const {
    elections,
    total,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useElections({ state: queryState });

  const onChainTotal = useMemo(() => {
    if (blockchain.totalElections === undefined) return null;
    return Number(blockchain.totalElections);
  }, [blockchain.totalElections]);

  const refresh = () => {
    refetch();
    blockchain.refetch();
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Election Dashboard"
        title="Elections"
        description="Discover elections indexed from the VOTEX contracts. Select an election to read its authoritative state directly from the blockchain."
        actions={
          <Button
            variant="outline"
            onClick={refresh}
            disabled={isFetching}
            data-testid="refresh-elections"
          >
            <RefreshCw
              className={cn("h-4 w-4", isFetching && "animate-spin")}
              aria-hidden
            />
            Refresh
          </Button>
        }
      />

      {/* Chain + indexer summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          icon={<Boxes className="h-4 w-4 text-primary" aria-hidden />}
          label="Elections (on-chain)"
          value={
            blockchain.isLoadingElections
              ? "…"
              : onChainTotal === null
                ? "—"
                : onChainTotal.toString()
          }
        />
        <SummaryTile
          icon={<Vote className="h-4 w-4 text-primary" aria-hidden />}
          label="Indexed elections"
          value={total.toString()}
        />
        <SummaryTile
          icon={<Activity className="h-4 w-4 text-primary" aria-hidden />}
          label="Events indexed"
          value={
            blockchain.status.eventsIndexed === null
              ? "—"
              : blockchain.status.eventsIndexed.toString()
          }
        />
        <SummaryTile
          icon={<Boxes className="h-4 w-4 text-primary" aria-hidden />}
          label="Latest block"
          value={
            blockchain.blockNumber !== undefined
              ? blockchain.blockNumber.toString()
              : blockchain.status.latestBlock !== null
                ? blockchain.status.latestBlock.toString()
                : "—"
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter by state">
        {FILTERS.map((value) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                active
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground",
              )}
              data-testid={`filter-${value}`}
            >
              {FILTER_LABELS[value]}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground">
          Indexed view · source: backend indexer
        </span>
      </div>

      {/* Error */}
      {error ? (
        <Alert
          variant="danger"
          title="Could not load elections"
          data-testid="elections-error"
        >
          <p>{error.message}</p>
          <p className="mt-1 opacity-80">
            The indexer may be offline. Elections are still readable directly
            from the blockchain once the backend is available.
          </p>
        </Alert>
      ) : null}

      {/* Content */}
      {isLoading ? (
        <ElectionGridSkeleton />
      ) : elections.length === 0 && !error ? (
        <EmptyState
          title={
            filter === "ALL"
              ? "No elections indexed yet"
              : `No ${FILTER_LABELS[filter].toLowerCase()} elections`
          }
          description="Try a different state filter, or refresh once the indexer has caught up with the chain."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {elections.map((election, index) => (
            <ElectionCard
              key={election.id}
              election={election}
              index={index}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground/80">
        Listing is an <Badge variant="muted">OFF-CHAIN INDEXED VIEW</Badge> for
        discovery. Voting eligibility, live vote counts, and the final winner are
        always read from the election contracts themselves.
      </p>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </Card>
  );
}

function ElectionGridSkeleton() {
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="elections-loading"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="mt-2 grid grid-cols-2 gap-3 border-t border-border/50 pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}
