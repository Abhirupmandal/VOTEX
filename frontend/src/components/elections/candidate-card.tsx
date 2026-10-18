"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { percentOf } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { OnChainCandidate } from "@/types";

export interface CandidateCardProps {
  candidate: OnChainCandidate;
  selected: boolean;
  onSelect: (candidateId: number) => void;
  /** Blocked when the wallet cannot vote (ineligible, already voted, not active). */
  disabled?: boolean;
  disabledReason?: string;
  /** When true, show live vote counts + share bars (results context). */
  showVotes?: boolean;
  totalVotes?: number;
  index?: number;
}

/** Selectable candidate card (Phase 5 §8). */
export function CandidateCard({
  candidate,
  selected,
  onSelect,
  disabled = false,
  disabledReason,
  showVotes = false,
  totalVotes = 0,
  index = 0,
}: CandidateCardProps) {
  const id = Number(candidate.candidateId);
  const votes = Number(candidate.voteCount);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      data-testid="candidate-card"
      data-candidate-id={id}
    >
      <Card
        className={cn(
          "flex h-full flex-col gap-3 transition-colors",
          selected ? "border-primary/70 ring-1 ring-primary/40" : "border-border/60",
          candidate.active ? "" : "opacity-70",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              {id}
            </span>
            <h3 className="font-semibold tracking-tight">
              {candidate.name || `Candidate ${id}`}
            </h3>
          </div>
          {candidate.active ? null : (
            <Badge variant="muted" className="uppercase">
              Inactive
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {candidate.description || "No description provided."}
        </p>

        {showVotes ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Votes</span>
              <span className="font-semibold tabular-nums">{votes}</span>
            </div>
            <Progress
              value={percentOf(votes, totalVotes)}
              label={`${candidate.name} share`}
            />
            <p className="text-xs text-muted-foreground">
              {percentOf(votes, totalVotes).toFixed(1)}% of total
            </p>
          </div>
        ) : null}

        <div className="mt-auto pt-1">
          {selected ? (
            <Button
              variant="default"
              className="w-full"
              disabled
              data-testid={`selected-${id}`}
              aria-pressed="true"
            >
              <Check className="h-4 w-4" aria-hidden />✓ SELECTED
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              disabled={disabled || !candidate.active}
              title={disabled && disabledReason ? disabledReason : undefined}
              onClick={() => onSelect(id)}
              data-testid={`select-${id}`}
            >
              SELECT
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
