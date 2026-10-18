"use client";

/**
 * React binding for {@link executeAdminWrite} (Phase 6 §3, §9, §17).
 *
 * Exposes the transaction state machine plus a `run(params)` helper that any
 * admin capability can invoke. On CONFIRMED it calls `onConfirmed` so callers
 * can invalidate queries and force a real frontend refresh (§20).
 */

import { useCallback, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import type { Abi, Address, Hex } from "viem";

import {
  ADMIN_BUSY_STATES,
  executeAdminWrite,
  type AdminTxReceipt,
  type AdminTxStatus,
} from "@/lib/admin/tx";
import { toFriendlyError, type FriendlyError } from "@/lib/errors";

export interface RunAdminWriteParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  /** Invoked exactly once after an on-chain CONFIRMED receipt. */
  onConfirmed?: (receipt: AdminTxReceipt) => void;
}

export interface UseAdminTxResult {
  status: AdminTxStatus;
  txHash: Hex | undefined;
  receipt: AdminTxReceipt | undefined;
  error: FriendlyError | null;
  isBusy: boolean;
  isConfirmed: boolean;
  isError: boolean;
  run: (params: RunAdminWriteParams) => Promise<boolean>;
  reset: () => void;
}

export function useAdminTx(): UseAdminTxResult {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [status, setStatus] = useState<AdminTxStatus>("IDLE");
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined);
  const [receipt, setReceipt] = useState<AdminTxReceipt | undefined>(undefined);
  const [error, setError] = useState<FriendlyError | null>(null);

  const reset = useCallback(() => {
    setStatus("IDLE");
    setTxHash(undefined);
    setReceipt(undefined);
    setError(null);
  }, []);

  const run = useCallback(
    async (params: RunAdminWriteParams): Promise<boolean> => {
      setError(null);
      setReceipt(undefined);
      setTxHash(undefined);

      if (!publicClient || !walletClient || !address) {
        setError(
          toFriendlyError(new Error("Connect a wallet to send this transaction.")),
        );
        setStatus("FAILED");
        return false;
      }

      const outcome = await executeAdminWrite({
        publicClient,
        walletClient,
        account: address,
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
        onStatus: setStatus,
        onHash: setTxHash,
      });

      if (outcome.receipt) setReceipt(outcome.receipt);
      if (outcome.error) setError(outcome.error);
      setStatus(outcome.status);

      if (outcome.status === "CONFIRMED" && outcome.receipt) {
        params.onConfirmed?.(outcome.receipt);
        return true;
      }
      return false;
    },
    [address, publicClient, walletClient],
  );

  const isBusy = useMemo(() => ADMIN_BUSY_STATES.includes(status), [status]);
  const isError = status === "FAILED" || status === "REJECTED";

  return {
    status,
    txHash,
    receipt,
    error,
    isBusy,
    isConfirmed: status === "CONFIRMED",
    isError,
    run,
    reset,
  };
}
