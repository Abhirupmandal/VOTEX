import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CandidateCard } from "@/components/elections/candidate-card";
import type { OnChainCandidate } from "@/types";

const candidate: OnChainCandidate = {
  candidateId: 3n,
  name: "Ada Lovelace",
  description: "Analytical engine advocate",
  voteCount: 7n,
  active: true,
};

describe("CandidateCard", () => {
  it("shows a SELECT button and emits the candidate id on click", async () => {
    const onSelect = vi.fn();
    render(
      <CandidateCard candidate={candidate} selected={false} onSelect={onSelect} />,
    );

    const button = screen.getByTestId("select-3");
    expect(button).toHaveTextContent("SELECT");
    await userEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("shows a disabled ✓ SELECTED state when selected", () => {
    render(
      <CandidateCard candidate={candidate} selected onSelect={() => {}} />,
    );

    const selected = screen.getByTestId("selected-3");
    expect(selected).toBeDisabled();
    expect(selected).toHaveTextContent("SELECTED");
    expect(selected).toHaveAttribute("aria-pressed", "true");
  });

  it("disables SELECT when the wallet cannot vote", () => {
    render(
      <CandidateCard
        candidate={candidate}
        selected={false}
        onSelect={() => {}}
        disabled
        disabledReason="Not eligible"
      />,
    );

    expect(screen.getByTestId("select-3")).toBeDisabled();
  });

  it("disables SELECT for an inactive candidate", () => {
    render(
      <CandidateCard
        candidate={{ ...candidate, active: false }}
        selected={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("select-3")).toBeDisabled();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("renders vote share when showVotes is enabled", () => {
    render(
      <CandidateCard
        candidate={candidate}
        selected={false}
        onSelect={() => {}}
        showVotes
        totalVotes={10}
      />,
    );

    expect(screen.getByText("70.0% of total")).toBeInTheDocument();
  });
});
