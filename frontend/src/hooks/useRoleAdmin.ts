"use client";

/**
 * Role administration (Phase 6 §13).
 *
 * grant/revoke call the REAL OpenZeppelin `grantRole`/`revokeRole` on the
 * deployed VotexAccessManager. Only a wallet holding DEFAULT_ADMIN_ROLE can
 * succeed on-chain; the UI gate is UX, the contract guard is the boundary.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";

import { votexAccessManagerAbi } from "@/lib/contracts/abis";
import { contractAddresses } from "@/lib/contracts/addresses";
import { useAdminTx, type UseAdminTxResult } from "@/hooks/useAdminTx";

export interface UseRoleAdminResult extends Omit<UseAdminTxResult, "run"> {
  grantRole: (roleHash: Hex, account: Address) => Promise<boolean>;
  revokeRole: (roleHash: Hex, account: Address) => Promise<boolean>;
}

export function useRoleAdmin(): UseRoleAdminResult {
  const tx = useAdminTx();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["readContract"] });
    void queryClient.invalidateQueries({ queryKey: ["readContracts"] });
  }, [queryClient]);

  const grantRole = useCallback(
    (roleHash: Hex, account: Address) => {
      if (!contractAddresses.accessManager) return Promise.resolve(false);
      return tx.run({
        address: contractAddresses.accessManager,
        abi: votexAccessManagerAbi,
        functionName: "grantRole",
        args: [roleHash, account],
        onConfirmed: invalidate,
      });
    },
    [tx, invalidate],
  );

  const revokeRole = useCallback(
    (roleHash: Hex, account: Address) => {
      if (!contractAddresses.accessManager) return Promise.resolve(false);
      return tx.run({
        address: contractAddresses.accessManager,
        abi: votexAccessManagerAbi,
        functionName: "revokeRole",
        args: [roleHash, account],
        onConfirmed: invalidate,
      });
    },
    [tx, invalidate],
  );

  return useMemo(() => ({ ...tx, grantRole, revokeRole }), [tx, grantRole, revokeRole]);
}
