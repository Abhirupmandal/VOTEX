"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Scale } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LifecycleControls } from "@/components/admin/lifecycle-controls";
import { CandidateManager } from "@/components/admin/candidate-manager";
import { useElection } from "@/hooks/useElection";
import { useAnalytics } from "@/hooks/useResults";
import { useAuditEvents } from "@/hooks/useAudit";
import { useElectionRisk } from "@/hooks/useGuardian";
import { compareConsistency } from "@/lib/admin/consistency";
import { statePresentation } from "@/lib/elections";
import { formatTimestamp, shortenAddress, shortenHash } from "@/lib/formatting";

/** Manage one election (§7, §8): lifecycle + candidates, straight from the chain. */
export default function AdminElectionDetailPage() {
  const params = useParams<{ id: string }>();
  const electionId = Number(params?.id);
  const validId = Number.isFinite(electionId);

  const { election, candidates, address, isLoading, error, refetch } =
    useElection(validId ? electionId : undefined);
  const analytics = useAnalytics(validId ? electionId : undefined);
  const risk = useElectionRisk(validId ? electionId : undefined);
  const audit = useAuditEvents({ electionId: validId ? electionId : undefined, pageSize: 1 });

  const consistency = useMemo(() => {
    if (!election) return null;
    return compareConsistency(
      [
        {
          field: "Registered voters",
          onChain: Number(election.totalRegisteredVoters),
          indexed: analytics.isLoading ? null : analytics.analytics?.registered_voters,
        },
        {
          field: "Votes counted",
          onChain: Number(election.totalVotes),
          indexed: analytics.isLoading ? null : analytics.analytics?.total_votes,
        },
        {
          field: "Candidates",
          onChain: candidates.length,
          indexed: analytics.isLoading
            ? null
            : analytics.analytics?.votes_by_candidate.length,
        },
      ],
      2,
    );
  }, [election, candidates.length, analytics.analytics, analytics.isLoading]);

  if (!validId) {
    return (
      <EmptyState
        title="Invalid election id"
        description="The URL does not contain a numeric election identifier."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="danger" title="Could not load election">
        {error.message}
      </Alert>
    );
  }

  if (!election || !election.exists) {
    return (
      <EmptyState
        title={`Election #${electionId} not found`}
        description="No election exists at this id on the configured factory."
        action={
          <Button asChild variant="outline">
            <Link href="/admin/elections">Back to elections</Link>
          </Button>
        }
      />
    );
  }

  const presentation = statePresentation(election.stateName);
  const totalVotesNum = Number(election.totalVotes);
  const totalVotersNum = Number(election.totalRegisteredVoters);
  const turnoutPercent =
    totalVotersNum > 0 ? ((totalVotesNum / totalVotersNum) * 100).toFixed(1) + "%" : "0.0%";

  const latestTx = audit.events[0]?.transaction_hash;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 w-fit">
          <Link href="/admin/elections">
            <ArrowLeft className="h-4 w-4" />
            All elections
          </Link>
        </Button>
        <PageHeader
          eyebrow={`Election #${electionId}`}
          title={election.title || "Untitled election"}
          description={election.description || "No description provided."}
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="success">ON-CHAIN VERIFIED ✓</Badge>
              <Badge variant={presentation.tone === "danger" ? "danger" : presentation.tone}>
                {presentation.label}
              </Badge>
            </div>
          }
        />
      </div>

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6" data-testid="election-facts">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Contract
          </p>
          <p className="flex items-center gap-1 font-mono text-sm">
            {shortenAddress(address)}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Candidates
          </p>
          <p className="text-sm font-medium">{candidates.length}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Registered Voters
          </p>
          <p className="text-sm font-medium">
            {election.totalRegisteredVoters.toString()}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Votes Cast
          </p>
          <p className="text-sm font-medium">{election.totalVotes.toString()}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Turnout
          </p>
          <p className="text-sm font-medium">{turnoutPercent}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            AI Risk Level
          </p>
          <p className="text-sm font-medium flex items-center gap-1">
            <Badge
              variant={
                risk.risk?.threat_level === "CRITICAL"
                  ? "danger"
                  : risk.risk?.threat_level === "HIGH"
                    ? "warning"
                    : "default"
              }
            >
              {risk.risk?.threat_level ?? "CALIBRATING"}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {risk.risk ? `(${risk.risk.risk_score}/100)` : ""}
            </span>
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Registration Window
          </p>
          <p className="text-xs font-mono">
            {formatTimestamp(election.registrationStart)} → {formatTimestamp(election.registrationEnd)}
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Voting Window
          </p>
          <p className="text-xs font-mono">
            {formatTimestamp(election.votingStart)} → {formatTimestamp(election.votingEnd)}
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Latest On-Chain Event Tx
          </p>
          <p className="text-xs font-mono text-muted-foreground">
            {latestTx ? shortenHash(latestTx) : "—"}
          </p>
        </div>
      </Card>


      {consistency && !consistency.consistent ? (
        <Card className="space-y-3" data-testid="election-consistency">
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" aria-hidden />
            DATA CONSISTENCY CHECK
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            On-chain values compared with the backend index. The blockchain is
            authoritative; any divergence means the indexer may be lagging.
          </p>
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {consistency.rows.map((row) => (
              <li
                key={row.field}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span>{row.field}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    chain {String(row.onChain)} · index {String(row.indexed)}
                  </span>
                  <Badge
                    variant={
                      row.severity === "ok"
                        ? "success"
                        : row.severity === "lag"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {row.severity === "ok"
                      ? "Match"
                      : row.severity === "lag"
                        ? "Indexer lag"
                        : "Mismatch"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LifecycleControls
          electionId={electionId}
          electionAddress={address}
          stateName={election.stateName}
          onChanged={refetch}
        />
        <CandidateManager
          electionId={electionId}
          electionAddress={address}
          candidates={candidates}
          stateName={election.stateName}
          onChanged={refetch}
        />
      </div>
    </div>
  );
}
