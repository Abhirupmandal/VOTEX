import { Badge } from "@/components/ui/badge";
import { statePresentation } from "@/lib/elections";
import { cn } from "@/lib/utils";

export interface ElectionStateBadgeProps {
  state: string | undefined | null;
  className?: string;
}

/**
 * Lifecycle-state pill. The label/tone come from the single shared
 * `statePresentation` map so every view renders a state identically.
 */
export function ElectionStateBadge({ state, className }: ElectionStateBadgeProps) {
  const view = statePresentation(state);
  return (
    <Badge
      variant={view.tone}
      className={cn("uppercase tracking-wide", className)}
      data-testid="election-state"
      data-state={state ?? "UNKNOWN"}
    >
      {view.label}
    </Badge>
  );
}
