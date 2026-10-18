"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Crown, MinusCircle, Radio } from "lucide-react";
import { useBlockNumber } from "wagmi";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ElectionStateBadge } from "@/components/elections/election-state-badge";
import { CandidateCard } from "@/components/elections/candidate-card";
import { VerificationCard } from "@/components/results/verification-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalytics, useElection } from "@/hooks";
import { shortenAddress } from "@/lib/formatting";

/** Live/final results read authoritatively from the election contract (§14, §15). */
export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const electionId = Number(params?.id);
  const validId = Number.isFinite(electionId);

  const { election, candidates, winner, address, isLoading, error } = useElection(
    validId ? electionId : undefined,
  );
  const analytics = useAnalytics(validId ? electionId : undefined);
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const totalVotes = election ? Number(election.totalVotes) : 0;
  const finalized = election?.stateName === "RESULTS_FINALIZED";

  const winnerCandidate = useMemo(() => {
    if (!winner || winner.tie) return null;
    return (
      candidates.find((c) => Number(c.candidateId) === Number(winner.winnerId)) ??
      null
    );
  }, [winner, candidates]);

  const hasVotes = totalVotes > 0;

  if (!validId) {
    return (
      <EmptyState
        title="Invalid election id"
        description="The election id in the URL is not valid."
        action={
          <Button asChild variant="outline">
            <Link href="/elections">Back to elections</Link>
          </Button>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8" data-testid="results-loading">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex flex-col gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !election || !election.exists) {
    return (
      <EmptyState
        title="Results unavailable"
        description="No election contract is registered for this id on the VOTEX factory."
        action={
          <Button asChild variant="outline">
            <Link href="/elections">Back to elections</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href={`/elections/${electionId}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Election
          </Link>
        </Button>

        <PageHeader
          eyebrow={`Election #${electionId}`}
          title="Results"
          description={election.title || "Untitled election"}
          actions={
            <div className="flex items-center gap-2">
              <ElectionStateBadge state={election.stateName} />
              {finalized ? (
                <Badge variant="info">FINALIZED</Badge>
              ) : (
                <Badge variant="warning" data-testid="live-badge">
                  <Radio className="h-3 w-3 animate-pulse" aria-hidden />
                  LIVE RESULTS
                </Badge>
              )}
            </div>
          }
        />
      </div>

      {/* Summary band */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Total votes
          </span>
          <span className="text-3xl font-bold tabular-nums">{totalVotes}</span>
        </Card>

        <Card className="flex flex-col gap-1 p-4" data-testid="winner-tile">
          <span className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
            <Crown className="h-3.5 w-3.5 text-primary" aria-hidden />
            {finalized ? "Winner" : "Leading"}
          </span>
          {!hasVotes ? (
            <span className="text-lg font-semibold text-muted-foreground">
              No votes yet
            </span>
          ) : winner?.tie ? (
            <span className="flex items-center gap-2 text-lg font-semibold text-amber-400">
              <MinusCircle className="h-4 w-4" aria-hidden />
              Tie
            </span>
          ) : (
            <span className="text-lg font-semibold">
              {winnerCandidate?.name ||
                (winner ? `Candidate ${winner.winnerId}` : "—")}
            </span>
          )}
        </Card>

        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Registered voters
          </span>
          <span className="text-3xl font-bold tabular-nums">
            {Number(election.totalRegisteredVoters)}
          </span>
        </Card>
      </div>

      {!finalized ? (
        <Alert variant="info" title="Live results — not yet finalized">
          <p>
            The election has not been finalized. These counts may still change as
            votes are cast. Only the ACTIVE → ENDED → RESULTS_FINALIZED transition
            (performed by an authorised role) makes them official.
          </p>
        </Alert>
      ) : (
        <Alert variant="success" title="Results finalized on-chain">
          <p>
            The election contract has been transitioned to RESULTS_FINALIZED. The
            winner below is authoritative.
          </p>
        </Alert>
      )}

      {winner?.tie && hasVotes ? (
        <Alert variant="warning" title="Tie detected" data-testid="tie-alert">
          <p>
            The top candidates share the highest vote count. The contract reports
            a tie rather than a single winner.
          </p>
        </Alert>
      ) : null}

      {/* Distribution */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Vote distribution{" "}
          <span className="text-muted-foreground">({candidates.length})</span>
        </h2>

        {candidates.length === 0 ? (
          <EmptyState
            title="No candidates"
            description="This election has no candidates registered on-chain."
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((candidate, index) => (
              <CandidateCard
                key={Number(candidate.candidateId)}
                candidate={candidate}
                index={index}
                selected={false}
                onSelect={() => undefined}
                disabled
                showVotes
                totalVotes={totalVotes}
              />
            ))}
          </div>
        )}
      </section>

      <VerificationCard
        electionId={electionId}
        contractAddress={address}
        blockNumber={blockNumber ?? null}
      />

      {/* Indexed analytics (supplementary) */}
      {analytics.analytics ? (
        <Card className="flex flex-col gap-3" data-testid="analytics-card">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold tracking-tight">Turnout</h2>
            <Badge variant="muted" className="ml-auto">
              OFF-CHAIN INDEXED VIEW
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Indexed votes
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {analytics.analytics.total_votes}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Registered
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {analytics.analytics.registered_voters}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Turnout
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {(analytics.analytics.turnout * 100).toFixed(1)}%
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground/80">
            Supplementary diagnostics only — the figures above the fold are read
            from the contract.
          </p>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground/80">
        Contract {shortenAddress(address)} · verify any tally by re-reading it
        directly via the audit explorer.
      </p>
    </div>
  );
}
