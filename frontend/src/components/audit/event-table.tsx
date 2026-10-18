"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditEventOut } from "@/types";
import { formatTimestamp, shortenAddress, shortenHash } from "@/lib/formatting";
import { getExplorerTxUrl, isExternalExplorerAvailable } from "@/lib/explorer";

export interface EventTableProps {
  events: AuditEventOut[];
  isLoading?: boolean;
}

/** Extract a nested election id from an event payload, if present. */
function electionIdOf(event: AuditEventOut): number | null {
  const raw = event.payload?.electionId ?? event.payload?.election_id;
  if (raw === undefined || raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const EVENT_TONE: Record<string, "success" | "info" | "warning" | "muted"> = {
  VoteCast: "success",
  VoterRegistered: "info",
  VoterReactivated: "info",
  ElectionCreated: "info",
  CandidateAdded: "info",
  ElectionStateChanged: "warning",
  VoterDeactivated: "warning",
  CandidateDeactivated: "warning",
  EmergencyAction: "warning",
};

/**
 * Read-only table of indexed blockchain events (Phase 5 §16).
 *
 * Columns: Block · Event · Transaction · Election · Timestamp · Status.
 * Nothing is fabricated — an empty index renders an empty state upstream.
 */
export function EventTable({ events, isLoading = false }: EventTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="audit-loading">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">
          Indexed blockchain events for the VOTEX audit trail
        </caption>
        <thead>
          <tr className="border-b border-border/60 bg-card/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-medium">Block</th>
            <th scope="col" className="px-4 py-3 font-medium">Event</th>
            <th scope="col" className="px-4 py-3 font-medium">Transaction</th>
            <th scope="col" className="px-4 py-3 font-medium">Election</th>
            <th scope="col" className="px-4 py-3 font-medium">Timestamp</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const electionId = electionIdOf(event);
            return (
              <tr
                key={event.id}
                className="border-b border-border/40 last:border-b-0 hover:bg-card/40"
                data-testid="audit-row"
              >
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  #{event.block_number}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={EVENT_TONE[event.event_type] ?? "muted"}>
                    {event.event_type}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/audit?tx=${event.transaction_hash}`}
                      className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                      title={event.transaction_hash}
                    >
                      {shortenHash(event.transaction_hash)}
                    </Link>
                    {isExternalExplorerAvailable() && (
                      <a
                        href={getExplorerTxUrl(event.transaction_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground transition hover:text-primary"
                        title="View on block explorer"
                        aria-label="View on block explorer"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  {electionId !== null ? (
                    <Link
                      href={`/elections/${electionId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      #{electionId}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatTimestamp(event.timestamp)}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    INDEXED
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Supporting detail strip for a transaction hash lookup. */
export function EventDetailList({
  events,
}: {
  events: AuditEventOut[];
}) {
  if (events.length === 0) return null;
  return (
    <ul className="space-y-2 text-xs" data-testid="tx-events">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2"
        >
          <span className="font-medium">{event.event_type}</span>
          <span className="text-muted-foreground">
            block #{event.block_number} · {shortenAddress(event.contract_address)}
          </span>
        </li>
      ))}
    </ul>
  );
}
