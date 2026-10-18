"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { targetChain } from "@/lib/wagmi";

/**
 * Prominent wrong-network warning with a switch action (Phase 5 §3).
 *
 * Renders nothing unless the wallet is connected to an unsupported chain.
 */
export function WrongNetworkBanner() {
  const { isConnected, isWrongNetwork, switchToVotexNetwork, chainId } = useWallet();

  if (!isConnected || !isWrongNetwork) return null;

  return (
    <div
      role="alert"
      data-testid="wrong-network-banner"
      className="flex flex-col items-start justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Wrong network detected{chainId ? ` (chain ${chainId})` : ""}. VOTEX runs
          on <strong>{targetChain.name}</strong> (chain {targetChain.id}).
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={switchToVotexNetwork}
        data-testid="switch-network"
      >
        Switch Network
      </Button>
    </div>
  );
}
