"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { EventTable, EventDetailList } from "@/components/audit/event-table";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuditEvents, useTransactionEvents } from "@/hooks";
import { cn } from "@/lib/utils";

const EVENT_TYPES = [
  "ALL",
  "ElectionCreated",
  "CandidateAdded",
  "VoteCast",
  "ElectionStateChanged",
  "VoterRegistered",
  "VoterDeactivated",
  "VoterReactivated",
  "EmergencyAction",
] as const;
type EventTypeFilter = (typeof EVENT_TYPES)[number];

/** Audit explorer (§16): indexed blockchain events with explorer columns. */
function AuditExplorer() {
  const searchParams = useSearchParams();
  const txParam = searchParams.get("tx") ?? undefined;
  const contractParam = searchParams.get("contract") ?? undefined;
  const electionParam = searchParams.get("election") ?? undefined;
  const electionId = electionParam ? Number(electionParam) : undefined;

  const [eventType, setEventType] = useState<EventTypeFilter>("ALL");
  const [page, setPage] = useState(1);
  const [contractInput, setContractInput] = useState(contractParam ?? "");

  const queryEventType = eventType === "ALL" ? undefined : eventType;
  const contractAddress = contractInput.trim() || undefined;

  const { events, total, pages, isLoading, isFetching, error, refetch } =
    useAuditEvents({
      eventType: queryEventType,
      contractAddress,
      electionId: Number.isFinite(electionId) ? electionId : undefined,
      page,
      pageSize: 25,
    });

  const txLookup = useTransactionEvents(txParam);

  const activeFilters = useMemo(
    () =>
      [
        queryEventType ? `type=${queryEventType}` : null,
        contractAddress ? `contract=${contractAddress.slice(0, 10)}…` : null,
        Number.isFinite(electionId) ? `election=#${electionId}` : null,
      ].filter(Boolean) as string[],
    [queryEventType, contractAddress, electionId],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Audit Explorer"
        title="Blockchain Audit Trail"
        description="Every indexed VOTEX event: block, event type, transaction, election, timestamp, and indexing status. Read-only, straight from the indexer."
        actions={
          <Button
            variant="outline"
            onClick={refetch}
            disabled={isFetching}
            data-testid="refresh-audit"
          >
            <RefreshCw
              className={cn("h-4 w-4", isFetching && "animate-spin")}
              aria-hidden
            />
            Refresh
          </Button>
        }
      />

      {/* Transaction lookup (deep link from a vote receipt) */}
      {txParam ? (
        <Card className="flex flex-col gap-3" data-testid="tx-lookup">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="font-semibold tracking-tight">
              Transaction lookup
            </h2>
            <Badge variant="muted" className="ml-auto">
              {txLookup.isLoading
                ? "Loading…"
                : `${txLookup.events.length} event(s)`}
            </Badge>
          </div>
          <code className="break-all font-mono text-xs text-muted-foreground">
            {txParam}
          </code>
          {txLookup.error ? (
            <Alert variant="warning" title="Transaction not found in the index">
              <p>
                The indexer may not have processed this transaction yet. It is
                still verifiable directly on the blockchain.
              </p>
            </Alert>
          ) : (
            <EventDetailList events={txLookup.events} />
          )}
        </Card>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter by event type">
          {EVENT_TYPES.map((value) => {
            const active = eventType === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setEventType(value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  active
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground",
                )}
                data-testid={`audit-filter-${value}`}
              >
                {value === "ALL" ? "All events" : value}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={contractInput}
            onChange={(e) => {
              setContractInput(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by contract address (0x…)"
            aria-label="Filter by contract address"
            className="h-9 w-full max-w-sm rounded-md border border-border/60 bg-card/40 px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            data-testid="audit-contract-input"
          />
          {activeFilters.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              Filters: {activeFilters.join(" · ")}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="danger" title="Could not load the audit trail" data-testid="audit-error">
          <p>{error.message}</p>
          <p className="mt-1 opacity-80">
            The indexer may be offline. Events remain verifiable directly on the
            blockchain.
          </p>
        </Alert>
      ) : null}

      {!isLoading && !error && events.length === 0 ? (
        <EmptyState
          title="No audit events"
          description="No indexed events match the current filters. Try clearing them or refresh once the indexer has caught up."
        />
      ) : (
        <EventTable events={events} isLoading={isLoading} />
      )}

      {/* Pagination */}
      {pages > 1 ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages} · {total} events
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="audit-prev"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              data-testid="audit-next"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground/80">
        <Badge variant="muted">OFF-CHAIN INDEXED VIEW</Badge> If the index is
        empty, verify any transaction directly on the local blockchain.
      </p>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <h1 className="text-3xl font-bold tracking-tight">Audit Explorer</h1>
          <p className="text-sm text-muted-foreground">Loading audit trail…</p>
        </div>
      }
    >
      <AuditExplorer />
    </Suspense>
  );
}
