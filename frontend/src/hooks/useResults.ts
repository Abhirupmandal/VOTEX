"use client";

import { useQuery } from "@tanstack/react-query";

import { getElectionAnalytics } from "@/lib/api";
import type { AnalyticsOut } from "@/types";

export interface UseAnalyticsResult {
  analytics: AnalyticsOut | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Indexed analytics for an election (Phase 5 §14, §17).
 *
 * Analytics are explicitly an OFF-CHAIN INDEXED VIEW and are always rendered
 * alongside the authoritative on-chain results — never instead of them.
 */
export function useAnalytics(
  electionId: number | undefined,
): UseAnalyticsResult {
  const query = useQuery({
    queryKey: ["election-analytics", electionId],
    queryFn: ({ signal }) =>
      getElectionAnalytics(electionId as number, { signal }),
    enabled: electionId !== undefined,
    retry: 1,
  });

  return {
    analytics: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),
  };
}
