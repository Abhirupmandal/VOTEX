"use client";

import { useQuery } from "@tanstack/react-query";

import { listElections } from "@/lib/api";
import type { ElectionSummary } from "@/types";

export interface UseElectionsParams {
  state?: string;
  page?: number;
  pageSize?: number;
}

export interface UseElectionsResult {
  elections: ElectionSummary[];
  total: number;
  page: number;
  pages: number;
  /** True on the very first load (no cached data yet). */
  isLoading: boolean;
  /** True during any background refresh. */
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Election discovery via the backend indexer (Phase 5 §6, §17).
 *
 * The index provides fast listing; the detail page then reads authoritative
 * state, candidates, and results directly from each election contract.
 */
export function useElections(params: UseElectionsParams = {}): UseElectionsResult {
  const { state, page = 1, pageSize = 50 } = params;

  const query = useQuery({
    queryKey: ["elections", { state: state ?? null, page, pageSize }],
    queryFn: ({ signal }) => listElections({ state, page, pageSize }, { signal }),
    retry: 1,
  });

  return {
    elections: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? page,
    pages: query.data?.pages ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),
  };
}
