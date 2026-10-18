"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  ExternalLink,
  Users,
  Vote,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { ElectionStateBadge } from "@/components/elections/election-state-badge";
import { CandidateCard } from "@/components/elections/candidate-card";
import { EligibilityBanner } from "@/components/voting/eligibility-banner";
import { VoteConfirmDialog } from "@/components/voting/vote-confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useElection,
  useVoterEligibility,
  useVoting,
  useWallet,
} from "@/hooks";
import { statePresentation, timelinePhase } from "@/lib/elections";
import { formatTimestamp, shortenAddress } from "@/lib/formatting";
import { useAccount } from "wagmi";

/** Election detail (§7, §8, §12, §13): authoritative on-chain view + voting. */
export default function ElectionDetailPage() {
  const params = useParams<{ id: string }>();
  const electionId = Number(params?.id);
  const validId = Number.isFinite(electionId);

  const { election, candidates, address, isLoading, error, refetch } =
    useElection(validId ? electionId : undefined);
  const { isConnected } = useAccount();
  const wallet = useWallet();
  const eligibility = useVoterEligibility(validId ? electionId : undefined);
  const voting = useVoting();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const selectedCandidate = useMemo(
    () =>
      selectedId === null
        ? null
        : candidates.find((c) => Number(c.candidateId) === selectedId) ?? null,
    [candidates, selectedId],
  );

  const presentation = statePresentation(election?.stateName);

  const handleConfirmed = useCallback(() => {
    refetch();
    eligibility.refetch();
  }, [refetch, eligibility]);

  const disabledReason = !isConnected
    ? "Connect your wallet to vote"
    : eligibility.hasVoted
      ? "This wallet has already voted"
      : eligibility.status !== "VERIFIED"
        ? "This wallet is not an eligible voter"
        : !presentation.votable
          ? "Voting is not open for this election"
          : undefined;

  const canVote = disabledReason === undefined;

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
      <div className="flex flex-col gap-8" data-testid="election-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex flex-col gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-9 w-full" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !election || !election.exists) {
    return (
      <div className="flex flex-col gap-6" data-testid="election-not-found">
        <EmptyState
          title="Election not found"
          description="No election contract is registered for this id on the VOTEX factory."
          action={
            <Button asChild variant="outline">
              <Link href="/elections">Back to elections</Link>
            </Button>
          }
        />
        {error ? (
          <Alert variant="danger" title="Failed to read the election">
            <p>{error.message}</p>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/elections">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All elections
          </Link>
        </Button>

        <PageHeader
          eyebrow={`Election #${electionId}`}
          title={election.title || "Untitled election"}
          description={election.description || "No description provided."}
          actions={
            <div className="flex items-center gap-2">
              <ElectionStateBadge state={election.stateName} />
              <Button asChild variant="outline" data-testid="view-results">
                <Link href={`/elections/${electionId}/results`}>
                  <BarChart3 className="h-4 w-4" aria-hidden />
                  Results
                </Link>
              </Button>
            </div>
          }
        />
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<Vote className="h-4 w-4 text-primary" aria-hidden />}
          label="Total votes"
          value={election.totalVotes.toString()}
        />
        <StatTile
          icon={<Users className="h-4 w-4 text-primary" aria-hidden />}
          label="Registered voters"
          value={election.totalRegisteredVoters.toString()}
        />
        <StatTile
          icon={<CalendarClock className="h-4 w-4 text-primary" aria-hidden />}
          label="Voting opens"
          value={formatTimestamp(election.votingStart)}
        />
        <StatTile
          icon={<CalendarClock className="h-4 w-4 text-primary" aria-hidden />}
          label="Voting closes"
          value={formatTimestamp(election.votingEnd)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Phase:{" "}
          <span className="font-medium text-foreground">
            {timelinePhase(
              election.stateName,
              Math.floor(Date.now() / 1000),
              Number(election.registrationStart),
              Number(election.votingEnd),
            )}
          </span>
        </span>
        {address ? (
          <>
            <span className="text-border">·</span>
            <span>Contract: {shortenAddress(address)}</span>
            <span className="text-border">·</span>
            <Link
              href={`/audit?contract=${address}`}
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              Verifiable on-chain
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          </>
        ) : null}
      </div>

      {/* Eligibility / double-vote */}
      <EligibilityBanner
        status={eligibility.status}
        hasVoted={eligibility.hasVoted}
        isConnected={isConnected}
        isLoading={eligibility.isLoading}
      />

      {!presentation.votable ? (
        <Alert variant="info" title={`Voting not open · ${presentation.label}`}>
          <p>
            Votes can only be cast while the election is ACTIVE. Candidates below
            are shown for reference.
          </p>
        </Alert>
      ) : null}

      {/* Candidates */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Candidates{" "}
          <span className="text-muted-foreground">({candidates.length})</span>
        </h2>

        {candidates.length === 0 ? (
          <EmptyState
            title="No candidates"
            description="This election has no candidates registered on-chain yet."
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((candidate, index) => (
              <CandidateCard
                key={Number(candidate.candidateId)}
                candidate={candidate}
                index={index}
                selected={selectedId === Number(candidate.candidateId)}
                onSelect={(id) => {
                  setSelectedId(id);
                  setDialogOpen(true);
                }}
                disabled={!canVote}
                disabledReason={disabledReason}
              />
            ))}
          </div>
        )}
      </section>

      {/* Selected summary + cast action */}
      {selectedCandidate && canVote ? (
        <Card
          className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"
          data-testid="selected-summary"
        >
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Selected
            </p>
            <p className="font-semibold">
              {selectedCandidate.name || `Candidate ${selectedCandidate.candidateId}`}
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} data-testid="open-confirm">
            <Vote className="h-4 w-4" aria-hidden />
            Confirm vote
          </Button>
        </Card>
      ) : null}

      <VoteConfirmDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        electionId={electionId}
        candidate={selectedCandidate}
        contractAddress={address}
        voting={voting}
        isWrongNetwork={wallet.isWrongNetwork}
        onSwitchNetwork={wallet.switchToVotexNetwork}
        onConfirmed={handleConfirmed}
      />
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </Card>
  );
}
