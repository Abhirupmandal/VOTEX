"use client";

/**
 * Authoritative chain clock (Phase 6 §5, §6).
 *
 * Client-side validation of election windows MUST compare against the chain's
 * own clock, not the browser wall clock: `ElectionFactory.createElection`
 * enforces `registrationStart >= block.timestamp`, so a draft that is "future"
 * by wall-clock can still be rejected on-chain (and vice versa). The blockchain
 * is authoritative, so the form validates against the latest block timestamp
 * read straight from the RPC transport.
 */

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

export interface UseChainTimeResult {
  /** Latest block timestamp in Unix seconds (falls back to wall clock until read). */
  nowSeconds: number;
  /** True once the value came from a real chain read rather than the fallback. */
  isAuthoritative: boolean;
  isLoading: boolean;
}

export function useChainTime(refetchInterval = 15_000): UseChainTimeResult {
  const publicClient = usePublicClient();

  const query = useQuery({
    queryKey: ["chain-time"],
    enabled: Boolean(publicClient),
    refetchInterval,
    queryFn: async (): Promise<number> => {
      const wall = Math.floor(Date.now() / 1000);
      if (!publicClient) return wall;
      const block = await publicClient.getBlock({ blockTag: "latest" });
      const chain = Number(block.timestamp);
      // A new block is stamped with `max(parent.timestamp + 1, wall clock)`.
      // On a real network `chain ≈ wall`; on a dev chain that has been idle the
      // last block can lag hours behind, so we estimate the NEXT block's
      // timestamp as the greater of the two. `registrationStart >=
      // block.timestamp` therefore stays satisfiable without ever trusting a
      // stale, lagging block time.
      return Math.max(chain, wall);
    },
  });

  return {
    // Fall back to wall clock only until the first authoritative read resolves.
    nowSeconds: query.data ?? Math.floor(Date.now() / 1000),
    isAuthoritative: query.data !== undefined,
    isLoading: query.isLoading,
  };
}
