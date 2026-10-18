"use client";

import { useQuery } from "@tanstack/react-query";
import { listVoters } from "@/lib/api";
import type { Paginated, VoterOut } from "@/types";

export interface UseVoterListParams {
  page?: number;
  pageSize?: number;
  active?: boolean;
}

export interface UseVoterListResult {
  data: Paginated<VoterOut> | undefined;
  voters: VoterOut[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useVoterList(params: UseVoterListParams = {}): UseVoterListResult {
  const query = useQuery({
    queryKey: ["voters-list", params.page ?? 1, params.pageSize ?? 25, params.active],
    queryFn: ({ signal }) =>
      listVoters(
        {
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 25,
          active: params.active,
        },
        { signal },
      ),
    refetchInterval: 15_000,
    retry: 1,
  });

  return {
    data: query.data,
    voters: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}
