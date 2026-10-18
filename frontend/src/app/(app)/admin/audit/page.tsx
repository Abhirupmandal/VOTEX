"use client";

import { useState } from "react";
import type { Address, Hex } from "viem";
import { BadgeCheck, RefreshCw, Search, ShieldQuestion } from "lucide-react";
import { usePublicClient } from "wagmi";

import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField, inputClassName } from "@/components/admin/form-field";
import { useAuditEvents } from "@/hooks/useAudit";
import { shortenAddress, shortenHash, formatTimestamp } from "@/lib/formatting";

/** Known event types emitted by the VOTEX contracts (offered as suggestions). */
const EVENT_TYPE_SUGGESTIONS = [
  "ElectionCreated",
  "ElectionStateChanged",
  "CandidateAdded",
  "CandidateDeactivated",
  "VoterRegistered",
  "VoterDeactivated",
  "VoterReactivated",
  "VoteCast",
  "ResultsFinalized",
  "ElectionPaused",
  "ElectionResumed",
  "RoleGranted",
  "RoleRevoked",
];

interface VerificationResult {
  ok: boolean;
  blockNumber: number;
  status: string;
}

/**
 * Admin audit trail (§16).
 *
 * Reads the backend-indexed event log and lets an auditor confirm each event
 * ACTUALLY exists on-chain: the "verify" action re-fetches the real transaction
 * receipt from the RPC. An indexer row with no matching on-chain receipt is
 * surfaced as UNVERIFIED — the chain is always the source of truth.
 */
export default function AdminAuditPage() {
  const publicClient = usePublicClient();

  const [eventType, setEventType] = useState("");
  const [electionIdInput, setElectionIdInput] = useState("");
  const [query, setQuery] = useState<{
    eventType?: string;
    electionId?: number;
    page: number;
  }>({ page: 1 });

  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifications, setVerifications] = useState<
    Record<string, VerificationResult>
  >({});

  const audit = useAuditEvents({
    eventType: query.eventType,
    electionId: query.electionId,
    page: query.page,
    pageSize: 25,
  });

  const applyFilters = () => {
    const parsed = Number(electionIdInput);
    setQuery({
      eventType: eventType.trim() || undefined,
      electionId: electionIdInput.trim() && Number.isFinite(parsed) ? parsed : undefined,
      page: 1,
    });
    setVerifications({});
  };

  const verify = async (transactionHash: string) => {
    if (!publicClient) return;
    setVerifying(transactionHash);
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: transactionHash as Hex,
      });
      setVerifications((prev) => ({
        ...prev,
        [transactionHash]: {
          ok: true,
          blockNumber: Number(receipt.blockNumber),
          status: receipt.status,
        },
      }));
    } catch {
      setVerifications((prev) => ({
        ...prev,
        [transactionHash]: { ok: false, blockNumber: 0, status: "not-found" },
      }));
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Auditor"
        title="Audit trail"
        description="Every on-chain event the indexer has captured. Verify any entry against the live chain — the receipt is authoritative, the index is a convenience."
        actions={
          <Button variant="outline" onClick={audit.refetch}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </Button>
        }
      />

      {/* Filters */}
      <Card className="space-y-4" data-testid="audit-filters">
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" aria-hidden />
          Filters
        </CardTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Event type" htmlFor="af-type">
            <input
              id="af-type"
              className={inputClassName}
              list="audit-event-types"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="e.g. VoteCast"
              spellCheck={false}
            />
            <datalist id="audit-event-types">
              {EVENT_TYPE_SUGGESTIONS.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Election ID" htmlFor="af-election">
            <input
              id="af-election"
              data-testid="af-election"
              className={inputClassName}
              value={electionIdInput}
              onChange={(e) => setElectionIdInput(e.target.value)}
              placeholder="e.g. 0"
              inputMode="numeric"
            />
          </FormField>
          <div className="flex items-end">
            <Button type="button" onClick={applyFilters} data-testid="audit-apply">
              Apply filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Results */}
      <Card className="space-y-4" data-testid="audit-results">
        <div className="flex items-center justify-between">
          <CardTitle>Events</CardTitle>
          <span className="text-xs text-muted-foreground">
            {audit.total} total · page {audit.page} of {Math.max(1, audit.pages)}
          </span>
        </div>

        {audit.isLoading ? (
          <Skeleton className="h-40" />
        ) : audit.error ? (
          <Alert variant="warning" title="Could not load audit events">
            {audit.error.message}
          </Alert>
        ) : audit.events.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="audit-empty">
            No indexed events match these filters. The index may be empty or still
            syncing.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-2 py-2">Event</th>
                  <th className="px-2 py-2">Contract</th>
                  <th className="px-2 py-2">Block</th>
                  <th className="px-2 py-2">Tx</th>
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Chain</th>
                </tr>
              </thead>
              <tbody>
                {audit.events.map((event) => {
                  const check = verifications[event.transaction_hash];
                  return (
                    <tr
                      key={event.id}
                      className="border-b border-border/40 align-middle"
                      data-testid="audit-row"
                    >
                      <td className="px-2 py-2 font-medium">{event.event_type}</td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {shortenAddress(event.contract_address as Address)}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{event.block_number}</td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {shortenHash(event.transaction_hash)}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {formatTimestamp(event.timestamp)}
                      </td>
                      <td className="px-2 py-2">
                        {check?.ok ? (
                          <Badge variant="success" data-testid="audit-verified">
                            <BadgeCheck className="h-3 w-3" />
                            Verified · blk {check.blockNumber}
                          </Badge>
                        ) : check ? (
                          <Badge variant="danger" data-testid="audit-unverified">
                            <ShieldQuestion className="h-3 w-3" />
                            Not on chain
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={verifying === event.transaction_hash}
                            onClick={() => verify(event.transaction_hash)}
                            data-testid="audit-verify"
                          >
                            {verifying === event.transaction_hash
                              ? "Checking…"
                              : "Verify on chain"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={audit.page <= 1 || audit.isFetching}
            onClick={() => {
              setQuery((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
              setVerifications({});
            }}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {audit.page}
          </span>
          <Button
            variant="outline"
            disabled={audit.page >= audit.pages || audit.isFetching}
            onClick={() => {
              setQuery((prev) => ({ ...prev, page: prev.page + 1 }));
              setVerifications({});
            }}
          >
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}
