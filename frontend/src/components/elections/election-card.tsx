"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Users, Vote } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ElectionStateBadge } from "@/components/elections/election-state-badge";
import type { ElectionSummary } from "@/types";

export interface ElectionCardProps {
  election: ElectionSummary;
  index?: number;
}

/**
 * Dashboard card for one indexed election.
 *
 * The counts shown here come from the indexer (fast discovery); the election
 * detail page re-reads the authoritative values straight from the contract.
 */
export function ElectionCard({ election, index = 0 }: ElectionCardProps) {
  const href = `/elections/${election.blockchain_election_id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      data-testid="election-card"
      data-election-id={election.blockchain_election_id}
    >
      <Link href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-lg">
        <Card className="flex h-full flex-col gap-4 transition-colors hover:border-primary/50">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Election #{election.blockchain_election_id}
              </p>
              <h2 className="text-lg font-semibold tracking-tight">
                {election.title || "Untitled election"}
              </h2>
            </div>
            <ElectionStateBadge state={election.state} />
          </div>

          <p className="line-clamp-2 text-sm text-muted-foreground">
            {election.description || "No description provided."}
          </p>

          <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border/50 pt-4 text-sm">
            <div className="flex items-center gap-2">
              <Vote className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-muted-foreground">Votes</span>
              <span className="ml-auto font-semibold">
                {election.total_votes}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-muted-foreground">Voters</span>
              <span className="ml-auto font-semibold">
                {election.total_registered_voters}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end text-sm font-medium text-primary">
            View election
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
