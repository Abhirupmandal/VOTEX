"use client";

/**
 * Transaction status surface (Phase 6 §17).
 *
 * Renders the deterministic transaction state machine shared by every admin
 * operation. It NEVER shows success before an on-chain confirmation: the
 * CONFIRMED state is only reachable once a receipt exists, and REJECTED/FAILED
 * are first-class terminal states (there is no endless spinner).
 */

import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import type { AdminTxStatus } from "@/lib/admin/tx";
import type { AdminTxReceipt } from "@/lib/admin/tx";
import type { FriendlyError } from "@/lib/errors";
import { getExplorerBlockUrl, getExplorerTxUrl, isExternalExplorerAvailable } from "@/lib/explorer";
import { shortenHash } from "@/lib/formatting";
import { cn } from "@/lib/utils";

export interface TransactionStatusProps {
  status: AdminTxStatus;
  txHash?: string;
  receipt?: AdminTxReceipt;
  error?: FriendlyError | null;
  /** Explorer base URL used to build a "view on chain" link. */
  className?: string;
}

const STEPS: Array<{ key: AdminTxStatus; label: string }> = [
  { key: "SIMULATING", label: "Simulating" },
  { key: "AWAITING_WALLET", label: "Awaiting wallet" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "CONFIRMING", label: "Confirming" },
  { key: "CONFIRMED", label: "Confirmed" },
];

const ORDER: Record<string, number> = {
  IDLE: -1,
  SIMULATING: 0,
  AWAITING_WALLET: 1,
  SUBMITTED: 2,
  CONFIRMING: 3,
  CONFIRMED: 4,
  REJECTED: -2,
  FAILED: -2,
};

export function TransactionStatus({
  status,
  txHash,
  receipt,
  error,
  className,
}: TransactionStatusProps) {
  if (status === "IDLE") return null;

  const isBusy = status === "SIMULATING" || status === "AWAITING_WALLET" ||
    status === "SUBMITTED" || status === "CONFIRMING";
  const isConfirmed = status === "CONFIRMED";
  const isRejected = status === "REJECTED";
  const isFailed = status === "FAILED";
  const currentIndex = ORDER[status] ?? -1;

  return (
    <div className={cn("space-y-3", className)} data-testid="tx-status">
      {isBusy ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="tx-progress">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{STEPS[currentIndex]?.label ?? "Working"}…</span>
        </div>
      ) : null}

      {isBusy ? (
        <ol className="flex flex-wrap gap-3 text-xs" data-testid="tx-steps">
          {STEPS.map((step, index) => (
            <li
              key={step.key}
              className={cn(
                "flex items-center gap-1",
                index <= currentIndex ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {index < currentIndex ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              ) : index === currentIndex ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="h-3 w-3 rounded-full border border-border" />
              )}
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {txHash ? (
        <div className="flex items-center gap-2 text-xs" data-testid="tx-hash">
          <span className="text-muted-foreground">Tx</span>
          <code className="rounded bg-card/60 px-2 py-0.5 font-mono">{shortenHash(txHash)}</code>
          <a
            href={getExplorerTxUrl(txHash)}
            target={isExternalExplorerAvailable() ? "_blank" : undefined}
            rel={isExternalExplorerAvailable() ? "noreferrer" : undefined}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <span>{isExternalExplorerAvailable() ? "View on Etherscan" : "View audit"}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ) : null}

      {isConfirmed && receipt ? (
        <Alert variant="success" title="✓ Transaction confirmed on-chain" data-testid="tx-confirmed">
          <p className="flex flex-wrap items-center gap-1.5">
            <span>Included in block</span>
            <a
              href={getExplorerBlockUrl(receipt.blockNumber)}
              target={isExternalExplorerAvailable() ? "_blank" : undefined}
              rel={isExternalExplorerAvailable() ? "noreferrer" : undefined}
              className="font-mono underline-offset-4 hover:underline text-primary"
            >
              #{receipt.blockNumber.toString()}
            </a>
            <span>·</span>
            <a
              href={getExplorerTxUrl(receipt.transactionHash)}
              target={isExternalExplorerAvailable() ? "_blank" : undefined}
              rel={isExternalExplorerAvailable() ? "noreferrer" : undefined}
              className="font-mono underline-offset-4 hover:underline text-primary inline-flex items-center gap-1"
            >
              {shortenHash(receipt.transactionHash)}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span>· gas {receipt.gasUsed.toString()}</span>
          </p>
        </Alert>
      ) : null}

      {isRejected ? (
        <Alert variant="warning" title="REJECTED" data-testid="tx-rejected">
          {error?.message ?? "You rejected the transaction in your wallet."}
        </Alert>
      ) : null}

      {isFailed ? (
        <Alert variant="danger" title={error?.title ?? "Transaction failed"} data-testid="tx-failed">
          <p>{error?.message ?? "The transaction could not be completed."}</p>
          {error?.rawMessage ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wide opacity-70">
                Technical details
              </summary>
              <code className="mt-1 block break-all font-mono text-[11px] opacity-80">
                {error.rawMessage}
              </code>
            </details>
          ) : null}
        </Alert>
      ) : null}

      {status === "AWAITING_WALLET" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          Confirm the transaction in your wallet to continue.
        </p>
      ) : null}

      {isFailed || isRejected ? <XCircle className="hidden h-0 w-0" /> : null}
    </div>
  );
}
