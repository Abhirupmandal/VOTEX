import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { EligibilityBanner } from "@/components/voting/eligibility-banner";

describe("EligibilityBanner", () => {
  it("prompts to connect a wallet when disconnected", () => {
    render(
      <EligibilityBanner
        status="UNKNOWN"
        hasVoted={false}
        isConnected={false}
        isLoading={false}
      />,
    );
    expect(
      screen.getByText("Connect your wallet to check eligibility"),
    ).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    render(
      <EligibilityBanner
        status="UNKNOWN"
        hasVoted={false}
        isConnected
        isLoading
      />,
    );
    expect(screen.getByTestId("eligibility-loading")).toBeInTheDocument();
  });

  it("shows the already-voted banner when hasVoted is true", () => {
    render(
      <EligibilityBanner
        status="VERIFIED"
        hasVoted
        isConnected
        isLoading={false}
      />,
    );
    expect(screen.getByTestId("eligibility-voted")).toBeInTheDocument();
  });

  it("shows the verified-voter banner for VERIFIED", () => {
    render(
      <EligibilityBanner
        status="VERIFIED"
        hasVoted={false}
        isConnected
        isLoading={false}
      />,
    );
    expect(screen.getByTestId("eligibility-verified")).toBeInTheDocument();
  });

  it("shows not-registered for NOT_REGISTERED", () => {
    render(
      <EligibilityBanner
        status="NOT_REGISTERED"
        hasVoted={false}
        isConnected
        isLoading={false}
      />,
    );
    expect(screen.getByTestId("eligibility-not-registered")).toBeInTheDocument();
  });

  it("shows inactive for INACTIVE", () => {
    render(
      <EligibilityBanner
        status="INACTIVE"
        hasVoted={false}
        isConnected
        isLoading={false}
      />,
    );
    expect(screen.getByTestId("eligibility-inactive")).toBeInTheDocument();
  });

  it("falls back to an unknown banner", () => {
    render(
      <EligibilityBanner
        status="UNKNOWN"
        hasVoted={false}
        isConnected
        isLoading={false}
      />,
    );
    expect(screen.getByTestId("eligibility-unknown")).toBeInTheDocument();
  });
});
