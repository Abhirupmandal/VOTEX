import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { EventTable } from "@/components/audit/event-table";
import { VerificationCard } from "@/components/results/verification-card";
import type { AuditEventOut } from "@/types";

const events: AuditEventOut[] = [
  {
    id: 1,
    event_type: "VoteCast",
    contract_address: "0x75537828f2ce51be7289709686A69CbFDbB714F1",
    transaction_hash: "0x" + "a".repeat(64),
    block_number: 123,
    block_hash: null,
    transaction_index: 0,
    log_index: 0,
    timestamp: 1_700_000_000,
    payload: { electionId: 1, candidateId: 2 },
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    event_type: "ElectionStateChanged",
    contract_address: "0x75537828f2ce51be7289709686A69CbFDbB714F1",
    transaction_hash: "0x" + "d".repeat(64),
    block_number: 124,
    block_hash: null,
    transaction_index: 1,
    log_index: 2,
    timestamp: null,
    payload: { election_id: 2 },
    created_at: "2026-01-01T00:00:05Z",
  },
];

describe("EventTable", () => {
  it("renders a skeleton while loading", () => {
    render(<EventTable events={[]} isLoading />);
    expect(screen.getByTestId("audit-loading")).toBeInTheDocument();
  });

  it("renders one row per event with indexed status", () => {
    render(<EventTable events={events} />);
    expect(screen.getAllByTestId("audit-row")).toHaveLength(2);
    expect(screen.getAllByText("INDEXED")).toHaveLength(2);
  });

  it("links the transaction and numeric election id", () => {
    render(<EventTable events={events} />);
    const txLink = screen.getAllByRole("link")[0];
    expect(txLink).toHaveAttribute(
      "href",
      `/audit?tx=${"0x" + "a".repeat(64)}`,
    );
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("renders nothing (no rows) when the index is empty", () => {
    render(<EventTable events={[]} />);
    expect(screen.queryAllByTestId("audit-row")).toHaveLength(0);
  });
});

describe("VerificationCard", () => {
  it("marks the result as blockchain-verified with a contract address", () => {
    render(
      <VerificationCard
        electionId={1}
        contractAddress="0x75537828f2ce51be7289709686A69CbFDbB714F1"
        blockNumber={99n}
      />,
    );

    expect(screen.getByTestId("verification-card")).toBeInTheDocument();
    expect(screen.getByText("BLOCKCHAIN VERIFIED")).toBeInTheDocument();
    expect(screen.getByText("99")).toBeInTheDocument();
  });

  it("links to the audit record for the election", () => {
    render(<VerificationCard electionId={7} contractAddress={undefined} />);
    const link = screen.getByTestId("view-audit-record");
    expect(link).toHaveAttribute("href", "/audit?election=7");
  });
});
