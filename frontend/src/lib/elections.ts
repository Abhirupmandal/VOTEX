/**
 * Presentation helpers shared by the election dashboard, detail, and results
 * views. Pure lookups — no chain or network access.
 */

import type { ElectionStateName } from "@/types";

export type StateTone = "muted" | "info" | "success" | "warning" | "danger";

export interface StatePresentation {
  label: string;
  tone: StateTone;
  /** Whether votes may be cast while in this state. */
  votable: boolean;
  /** Whether registration is currently open. */
  registerable: boolean;
}

const STATE_PRESENTATION: Record<ElectionStateName, StatePresentation> = {
  DRAFT: { label: "Draft", tone: "muted", votable: false, registerable: false },
  REGISTRATION: {
    label: "Registration",
    tone: "info",
    votable: false,
    registerable: true,
  },
  ACTIVE: { label: "Active", tone: "success", votable: true, registerable: false },
  PAUSED: { label: "Paused", tone: "warning", votable: false, registerable: false },
  ENDED: { label: "Ended", tone: "muted", votable: false, registerable: false },
  RESULTS_FINALIZED: {
    label: "Finalized",
    tone: "info",
    votable: false,
    registerable: false,
  },
};

const UNKNOWN_STATE: StatePresentation = {
  label: "Unknown",
  tone: "danger",
  votable: false,
  registerable: false,
};

/** Resolve presentation metadata from a state name (fallback: Unknown). */
export function statePresentation(state: string | undefined | null): StatePresentation {
  if (!state) return UNKNOWN_STATE;
  return STATE_PRESENTATION[state as ElectionStateName] ?? UNKNOWN_STATE;
}

/** Human phase label for the current voting timeline. */
export function timelinePhase(
  state: string,
  nowSeconds: number,
  registrationStart: number,
  votingEnd: number,
): string {
  if (state === "ACTIVE") return "Voting open";
  if (state === "RESULTS_FINALIZED") return "Results finalized";
  if (state === "PAUSED") return "Paused";
  if (state === "ENDED") return "Voting closed";
  if (state === "REGISTRATION") return "Registration open";
  if (nowSeconds < registrationStart) return "Scheduled";
  if (nowSeconds < votingEnd) return "Awaiting activation";
  return "Window elapsed";
}
