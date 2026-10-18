import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ElectionStateBadge } from "@/components/elections/election-state-badge";

describe("ElectionStateBadge", () => {
  it("renders the human label for ACTIVE", () => {
    render(<ElectionStateBadge state="ACTIVE" />);
    const badge = screen.getByTestId("election-state");
    expect(badge).toHaveTextContent("Active");
    expect(badge).toHaveAttribute("data-state", "ACTIVE");
  });

  it("renders Unknown for a missing state", () => {
    render(<ElectionStateBadge state={null} />);
    const badge = screen.getByTestId("election-state");
    expect(badge).toHaveTextContent("Unknown");
    expect(badge).toHaveAttribute("data-state", "UNKNOWN");
  });

  it("renders Finalized for RESULTS_FINALIZED", () => {
    render(<ElectionStateBadge state="RESULTS_FINALIZED" />);
    expect(screen.getByTestId("election-state")).toHaveTextContent("Finalized");
  });
});
