"use client";

import { useEffect, useState } from "react";
import { Copy, LogOut, Wallet, Check, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWallet } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";

/**
 * Wallet control surface (Phase 5 §4).
 *
 * Renders one of the five states: DISCONNECTED, CONNECTING, CONNECTED,
 * WRONG_NETWORK, ERROR — never exposing any secret material.
 */
export function WalletStatus() {
  const {
    status,
    shortAddress,
    networkName,
    isConnected,
    isWrongNetwork,
    isConnecting,
    error,
    copied,
    connectWallet,
    disconnectWallet,
    switchToVotexNetwork,
    copyAddress,
    hasConnector,
  } = useWallet();

  // wagmi state is client-only; avoid hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <Button size="sm" variant="outline" disabled aria-label="Connect wallet">
        <Wallet className="h-4 w-4" />
        Connect
      </Button>
    );
  }

  if (!isConnected) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isConnecting || !hasConnector}
        onClick={connectWallet}
        data-testid="wallet-connect"
        title={error ?? undefined}
      >
        <Wallet className="h-4 w-4" />
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          data-testid="wallet-chip"
          className={cn(isWrongNetwork && "border-amber-500/60 text-amber-300")}
        >
          {isWrongNetwork ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          )}
          <span className="font-mono">{shortAddress}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5">
          <p className="text-xs text-muted-foreground">Network</p>
          <p className={cn("text-sm font-medium", isWrongNetwork && "text-amber-400")}>
            {networkName}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void copyAddress()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy address"}
        </DropdownMenuItem>
        {isWrongNetwork ? (
          <DropdownMenuItem onClick={switchToVotexNetwork}>
            <AlertTriangle className="h-4 w-4" />
            Switch network
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={disconnectWallet}>
          <LogOut className="h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
