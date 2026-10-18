"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Send,
  Wallet,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { UseVotingResult } from "@/hooks";
import { shortenHash } from "@/lib/formatting";
import { getExplorerTxUrl, isExternalExplorerAvailable } from "@/lib/explorer";
import type { OnChainCandidate } from "@/types";
import { cn } from "@/lib/utils";

export interface VoteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  electionId: number;
  candidate: OnChainCandidate | null;
  contractAddress: `0x${string}` | undefined;
  voting: UseVotingResult;
  isWrongNetwork: boolean;
  onSwitchNetwork: () => void;
  /** Fired once the vote is confirmed, so the parent can re-read the chain. */
  onConfirmed: () => void;
}

/** Ordered steps surfaced during the vote flow (Phase 5 §9). */
const STEPS = [
  "Candidate selected",
  "Confirm vote",
  "Awaiting wallet confirmation",
  "Transaction submitted",
  "Confirming on blockchain",
  "Vote recorded",
] as const;

function stepIndexFor(status: UseVotingResult["status"]): number {
  switch (status) {
    case "SIMULATING":
      return 1;
    case "AWAITING_WALLET":
      return 2;
    case "SUBMITTED":
      return 3;
    case "CONFIRMING":
      return 4;
    case "CONFIRMED":
      return 5;
    default:
      return 0;
  }
}

/**
 * Vote confirmation + transaction progress dialog.
 *
 * Renders the REAL `useVoting` state machine. Every terminal branch (CONFIRMED,
 * REJECTED, FAILED) resolves; the dialog never leaves a spinning loader.
 */
export function VoteConfirmDialog({
  open,
  onClose,
  electionId,
  candidate,
  contractAddress,
  voting,
  isWrongNetwork,
  onSwitchNetwork,
  onConfirmed,
}: VoteConfirmDialogProps) {
  const { status, txHash, receipt, error, isBusy, castVote, reset } = voting;

  // When the vote confirms, refresh the parent's on-chain reads exactly once.
  useEffect(() => {
    if (status === "CONFIRMED") onConfirmed();
  }, [status, onConfirmed]);

  const handleClose = () => {
    if (isBusy) return;
    reset();
    onClose();
  };

  const confirm = () => {
    if (!candidate || !contractAddress) return;
    void castVote(electionId, Number(candidate.candidateId), contractAddress);
  };

  const done = status === "CONFIRMED";
  const failed = status === "FAILED";
  const rejected = status === "REJECTED";

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      hideClose={isBusy}
      data-testid="vote-dialog"
      title={
        done
          ? "Vote recorded"
          : failed || rejected
            ? "Vote not cast"
            : "Confirm your vote"
      }
      description={
        candidate
          ? `You are voting for ${candidate.name || `Candidate ${candidate.candidateId}`} in election #${electionId}.`
          : undefined
      }
    >
      {/* Pre-confirmation */}
      {status === "IDLE" ? (
        <div className="space-y-4">
          {isWrongNetwork ? (
            <Alert variant="warning" title="Wrong network">
              <p>
                Your wallet is not on the VOTEX network. Switch before voting.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={onSwitchNetwork}
                data-testid="dialog-switch-network"
              >
                Switch Network
              </Button>
            </Alert>
          ) : null}

          <p className="text-sm text-muted-foreground">
            This submits a real transaction to the election contract. You will be
            asked to approve it in your wallet. A vote cannot be changed once
            recorded.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={confirm}
              disabled={!candidate || !contractAddress || isWrongNetwork}
              data-testid="confirm-vote"
            >
              <Send className="h-4 w-4" aria-hidden />
              CONFIRM VOTE
            </Button>
          </div>
        </div>
      ) : null}

      {/* In-flight stages */}
      {isBusy || done ? (
        <div className="space-y-5">
          <div data-testid="vote-progress">
            <ol className="space-y-2">
              {STEPS.map((label, index) => {
                const current = stepIndexFor(status);
                const complete = index < current || done;
                const active = index === current && !done;
                return (
                  <li
                    key={label}
                    className={cn(
                      "flex items-center gap-3 text-sm",
                      complete ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {complete ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
                    ) : active ? (
                      <Spinner className="h-4 w-4" label={label} />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-border" aria-hidden />
                    )}
                    <span className={cn(active && "font-medium")}>{label}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {status === "SIMULATING" ? (
            <p className="text-xs text-muted-foreground">
              Simulating the transaction to catch any contract rejection before
              you approve it…
            </p>
          ) : null}

          {status === "AWAITING_WALLET" ? (
            <Alert variant="info" title="AWAITING WALLET CONFIRMATION">
              <p className="flex items-center gap-2">
                <Wallet className="h-3.5 w-3.5" aria-hidden />
                Approve the transaction in your wallet to continue.
              </p>
            </Alert>
          ) : null}

          {txHash ? (
            <div className="rounded-md border border-border/60 bg-card/60 p-3">
              <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                Transaction
              </p>
              <div className="flex items-center justify-between gap-2">
                <code
                  className="truncate font-mono text-xs text-primary"
                  data-testid="tx-hash"
                >
                  {txHash}
                </code>
                <Link
                  href={`/audit?tx=${txHash}`}
                  className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
                >
                  View
                </Link>
              </div>
            </div>
          ) : null}

          {status === "SUBMITTED" ? (
            <Alert variant="info" title="TRANSACTION SUBMITTED">
              <p className="flex items-center gap-2">
                <Send className="h-3.5 w-3.5" aria-hidden />
                Broadcasting to the network…
              </p>
            </Alert>
          ) : null}

          {status === "CONFIRMING" ? (
            <Alert variant="info" title="CONFIRMING ON BLOCKCHAIN">
              <p>Waiting for the first confirmation…</p>
            </Alert>
          ) : null}

          {done ? (
            <div className="space-y-4" data-testid="vote-confirmed">
              <Alert variant="success" title="✓ VOTE RECORDED">
                <p>
                  Your vote was mined and recorded on-chain.
                  {receipt
                    ? ` Block ${receipt.blockNumber.toString()}, gas ${receipt.gasUsed.toString()}.`
                    : ""}
                </p>
              </Alert>
              <div className="flex flex-wrap justify-end gap-2">
                {txHash ? (
                  <Button asChild variant="outline" data-testid="view-transaction">
                    <Link
                      href={getExplorerTxUrl(txHash)}
                      target={isExternalExplorerAvailable() ? "_blank" : undefined}
                      rel={isExternalExplorerAvailable() ? "noreferrer" : undefined}
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      VIEW TRANSACTION
                    </Link>
                  </Button>
                ) : null}
                <Button asChild variant="ghost">
                  <Link href={`/elections/${electionId}/results`}>
                    View results
                  </Link>
                </Button>
                <Button onClick={handleClose} data-testid="vote-done">
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Terminal error states */}
      {failed || rejected ? (
        <div className="space-y-4">
          <Alert
            variant={rejected ? "warning" : "danger"}
            title={error?.title ?? (rejected ? "Transaction rejected" : "Vote failed")}
            data-testid={rejected ? "vote-rejected" : "vote-failed"}
          >
            <p>
              {error?.message ??
                "The vote transaction could not be completed."}
            </p>
          </Alert>

          {isWrongNetwork ? (
            <Alert variant="warning" title="Wrong network">
              <p>Switch to the VOTEX network before trying again.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={onSwitchNetwork}
              >
                Switch Network
              </Button>
            </Alert>
          ) : null}

          {error?.rawMessage ? (
            <details className="rounded-md border border-border/60 bg-card/40 p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Technical details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                {error.rawMessage}
              </pre>
            </details>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Close
            </Button>
            <Button
              onClick={() => {
                reset();
              }}
              data-testid="retry-vote"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Try again
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
