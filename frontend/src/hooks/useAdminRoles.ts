"use client";

/**
 * Real on-chain role membership (Phase 6 §2, §3, §13).
 *
 * Membership is read DIRECTLY from the deployed VotexAccessManager via
 * `hasRole(account, role)`. We never infer access from "a wallet is connected".
 * The contract is the single source of truth; this hook is the UX projection.
 */

import { useCallback, useMemo } from "react";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import type { Address, Hex } from "viem";

import { accessManagerAddress } from "@/lib/contracts/addresses";
import { votexAccessManagerAbi } from "@/lib/contracts/abis";
import { ROLE_LIST, type RoleKey } from "@/lib/admin/roles";
import { TARGET_CHAIN_ID } from "@/lib/wagmi";

export interface UseAdminRolesResult {
  /** Connected wallet address, if any. */
  address: Address | undefined;
  isConnected: boolean;
  /** Whether the connected wallet holds at least one administrative role. */
  hasAdminAccess: boolean;
  /** Whether the connected wallet is the super-admin (DEFAULT_ADMIN_ROLE). */
  isSuperAdmin: boolean;
  /** Membership keyed by role, resolved from the chain. */
  roles: Record<RoleKey, boolean>;
  /** True once the first on-chain read has resolved. */
  isLoaded: boolean;
  isLoading: boolean;
  error: Error | null;
  /** Re-read membership from the chain (used after grant/revoke). */
  refresh: () => void;
}

const EMPTY_ROLES: Record<RoleKey, boolean> = {
  DEFAULT_ADMIN_ROLE: false,
  ELECTION_MANAGER_ROLE: false,
  VOTER_REGISTRAR_ROLE: false,
  SECURITY_OFFICER_ROLE: false,
  AUDITOR_ROLE: false,
};

export function useAdminRoles(): UseAdminRolesResult {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const enabled = Boolean(address && accessManagerAddress);

  const contracts = useMemo(
    () =>
      ROLE_LIST.map((role) => ({
        address: accessManagerAddress as Address,
        abi: votexAccessManagerAbi,
        functionName: "hasRole" as const,
        args: [role.hash as Hex, address as Address] as const,
        chainId: TARGET_CHAIN_ID,
      })),
    [address],
  );

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: { enabled },
  });

  const roles = useMemo<Record<RoleKey, boolean>>(() => {
    if (!data) return { ...EMPTY_ROLES };
    const next = { ...EMPTY_ROLES };
    ROLE_LIST.forEach((role, index) => {
      const entry = data[index];
      next[role.key] = Boolean(entry?.status === "success" && entry.result);
    });
    return next;
  }, [data]);

  const hasAdminAccess = useMemo(
    () => ROLE_LIST.some((role) => roles[role.key]),
    [roles],
  );

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const isLoaded = useMemo(
    () => !enabled || (data !== undefined && !isLoading),
    [enabled, data, isLoading],
  );

  return {
    address,
    isConnected,
    hasAdminAccess,
    isSuperAdmin: roles.DEFAULT_ADMIN_ROLE,
    roles,
    isLoaded,
    isLoading,
    error: (error as Error | null) ?? null,
    refresh,
  };
}

/** Read whether an arbitrary wallet holds a role (used by the role matrix). */
export function useRoleMembership(account: Address | undefined) {
  const contracts = useMemo(
    () =>
      ROLE_LIST.map((role) => ({
        address: accessManagerAddress as Address,
        abi: votexAccessManagerAbi,
        functionName: "hasRole" as const,
        args: [role.hash as Hex, account as Address] as const,
        chainId: TARGET_CHAIN_ID,
      })),
    [account],
  );

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: { enabled: Boolean(account && accessManagerAddress) },
  });

  const roles = useMemo<Record<RoleKey, boolean>>(() => {
    if (!data) return { ...EMPTY_ROLES };
    const next = { ...EMPTY_ROLES };
    ROLE_LIST.forEach((role, index) => {
      const entry = data[index];
      next[role.key] = Boolean(entry?.status === "success" && entry.result);
    });
    return next;
  }, [data]);

  return { roles, isLoading, error: (error as Error | null) ?? null, refetch };
}
