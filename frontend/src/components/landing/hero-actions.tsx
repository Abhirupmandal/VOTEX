"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConnectWallet } from "@/components/wallet/connect-wallet";

/**
 * Primary hero calls to action.
 *
 * The wallet control reflects the real connection state (wagmi); the
 * "Explore Elections" action routes to the live election dashboard, which
 * reads its data directly from the deployed contracts and the indexer.
 */
export function HeroActions() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <ConnectWallet />
      <Button asChild size="lg" variant="outline" data-testid="explore-elections">
        <Link href="/elections">
          Explore Elections
          <ArrowRight className="h-5 w-5" />
        </Link>
      </Button>
    </div>
  );
}
