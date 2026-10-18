"use client";

import Link from "next/link";
import { BadgeCheck, ExternalLink, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { shortenAddress } from "@/lib/formatting";

export interface VerificationCardProps {
  electionId: number;
  contractAddress: string | undefined;
  blockNumber?: bigint | null;
}

/**
 * Blockchain verification summary (Phase 5 §15).
 *
 * Confirms the displayed result was read directly from the election contract
 * and links to the audit trail. No result value is invented here — the caller
 * passes only what the contract returned.
 */
export function VerificationCard({
  electionId,
  contractAddress,
  blockNumber,
}: VerificationCardProps) {
  return (
    <Card className="flex flex-col gap-3" data-testid="verification-card">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden />
        <h2 className="font-semibold tracking-tight">BLOCKCHAIN VERIFIED</h2>
        <Badge variant="success" className="ml-auto">
          <BadgeCheck className="h-3 w-3" aria-hidden />
          On-chain
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        These results were read directly from the election contract
        {contractAddress ? (
          <>
            {" "}
            at <code className="font-mono text-xs">{shortenAddress(contractAddress)}</code>
          </>
        ) : null}
        . The backend index is shown only as a convenience and never overrides the
        chain.
      </p>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-widest text-muted-foreground">
            Contract
          </dt>
          <dd className="font-mono text-xs">{shortenAddress(contractAddress)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-muted-foreground">
            Observed block
          </dt>
          <dd className="font-mono text-xs">
            {blockNumber !== undefined && blockNumber !== null
              ? blockNumber.toString()
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm" data-testid="view-audit-record">
          <Link href={`/audit?election=${electionId}`}>
            VIEW AUDIT RECORD
            <ExternalLink className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
