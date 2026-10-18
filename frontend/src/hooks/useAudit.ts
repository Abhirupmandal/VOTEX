"use client";

import { useQuery } from "@tanstack/react-query";

import { getTransactionEvents, listAuditEvents } from "@/lib/api";
import type { AuditEventOut } from "@/types";

export interface UseAuditEventsParams {
  eventType?: string;
  contractAddress?: string;
  electionId?: number;
  page?: number;
  pageSize?: number;
}

export interface UseAuditEventsResult {
  events: AuditEventOut[];
  total: number;
  page: number;
  pages: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Audit trail reader (Phase 5 §16). Reads the indexed on-chain events from the
 * backend. Nothing is fabricated: if the index is empty the component shows an
 * empty state.
 */
export function useAuditEvents(
  params: UseAuditEventsParams = {},
): UseAuditEventsResult {
  const { eventType, contractAddress, electionId, page = 1, pageSize = 25 } = params;

  const query = useQuery({
    queryKey: [
      "audit-events",
      { eventType: eventType ?? null, contractAddress: contractAddress ?? null, electionId: electionId ?? null, page, pageSize },
    ],
    queryFn: ({ signal }) =>
      listAuditEvents(
        { eventType, contractAddress, electionId, page, pageSize },
        { signal },
      ),
    retry: 1,
  });

  return {
    events: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? page,
    pages: query.data?.pages ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),
  };
}

export interface UseTransactionEventsResult {
  events: AuditEventOut[];
  isLoading: boolean;
  error: Error | null;
}

/** Look up all indexed events emitted by a single transaction hash. */
export function useTransactionEvents(
  transactionHash: string | undefined,
): UseTransactionEventsResult {
  const query = useQuery({
    queryKey: ["audit-transaction", transactionHash],
    queryFn: ({ signal }) =>
      getTransactionEvents(transactionHash as string, { signal }),
    enabled: Boolean(transactionHash),
    retry: 1,
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
