"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Wallet, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { networkName } from "@/lib/wagmi";
import { shortenAddress } from "@/lib/utils";

/**
 * MetaMask-compatible connect button.
 *
 * Phase 1 only establishes the wallet connection and displays the active
 * account and network. No contract interactions are performed yet.
 */
export function ConnectWallet() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  // Avoid hydration mismatch: wagmi state is only known on the client.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button size="lg" variant="outline" disabled aria-label="Connect wallet">
        <Wallet className="h-5 w-5" />
        Connect Wallet
      </Button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className="rounded-md border border-border/60 bg-card/60 px-4 py-2 font-mono text-sm">
          <span className="text-muted-foreground">Wallet: </span>
          <span className="text-primary">{shortenAddress(address)}</span>
          <span className="mx-2 text-border">|</span>
          <span className="text-muted-foreground">Network: </span>
          <span>{networkName(chainId)}</span>
        </div>
        <Button variant="outline" size="lg" onClick={() => disconnect()}>
          <LogOut className="h-5 w-5" />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="lg"
      disabled={isPending || connectors.length === 0}
      onClick={() => {
        const connector = connectors[0];
        if (connector) connect({ connector });
      }}
      data-testid="connect-wallet"
    >
      <Wallet className="h-5 w-5" />
      {isPending ? "Connecting..." : "Connect Wallet"}
    </Button>
  );
}
