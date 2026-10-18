import { describe, expect, it } from "vitest";

import { statePresentation, timelinePhase } from "@/lib/elections";

describe("elections.statePresentation", () => {
  it("marks ACTIVE as votable and not registerable", () => {
    const view = statePresentation("ACTIVE");
    expect(view.label).toBe("Active");
    expect(view.tone).toBe("success");
    expect(view.votable).toBe(true);
    expect(view.registerable).toBe(false);
  });

  it("marks REGISTRATION as registerable but not votable", () => {
    const view = statePresentation("REGISTRATION");
    expect(view.registerable).toBe(true);
    expect(view.votable).toBe(false);
  });

  it("never marks non-ACTIVE states votable", () => {
    for (const state of ["DRAFT", "PAUSED", "ENDED", "RESULTS_FINALIZED"]) {
      expect(statePresentation(state).votable).toBe(false);
    }
  });

  it("falls back to a danger-toned Unknown for missing/unknown state", () => {
    expect(statePresentation(null).label).toBe("Unknown");
    expect(statePresentation("NONSENSE").tone).toBe("danger");
  });
});

describe("elections.timelinePhase", () => {
  it("reports the phase for explicit terminal states", () => {
    expect(timelinePhase("ACTIVE", 0, 0, 0)).toBe("Voting open");
    expect(timelinePhase("RESULTS_FINALIZED", 0, 0, 0)).toBe("Results finalized");
    expect(timelinePhase("ENDED", 0, 0, 0)).toBe("Voting closed");
    expect(timelinePhase("PAUSED", 0, 0, 0)).toBe("Paused");
    expect(timelinePhase("REGISTRATION", 0, 0, 0)).toBe("Registration open");
  });

  it("uses the schedule when the state is not terminal", () => {
    expect(timelinePhase("DRAFT", 100, 200, 400)).toBe("Scheduled");
    expect(timelinePhase("DRAFT", 300, 200, 400)).toBe("Awaiting activation");
    expect(timelinePhase("DRAFT", 500, 200, 400)).toBe("Window elapsed");
  });
});
