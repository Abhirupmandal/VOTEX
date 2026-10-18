import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { VoteConfirmDialog } from "@/components/voting/vote-confirm-dialog";
import type { UseVotingResult } from "@/hooks";
import type { OnChainCandidate, VoteTxStatus } from "@/types";

const candidate: OnChainCandidate = {
  candidateId: 2n,
  name: "Grace Hopper",
  description: "Compiler pioneer",
  voteCount: 0n,
  active: true,
};

const contractAddress = "0x75537828f2ce51be7289709686A69CbFDbB714F1" as const;

/** Build a UseVotingResult stub with a chosen status. */
function makeVoting(
  status: VoteTxStatus,
  overrides: Partial<UseVotingResult> = {},
): UseVotingResult {
  const busy: VoteTxStatus[] = [
    "SIMULATING",
    "AWAITING_WALLET",
    "SUBMITTED",
    "CONFIRMING",
  ];
  return {
    status,
    txHash: undefined,
    receipt: undefined,
    error: null,
    isBusy: busy.includes(status),
    isConfirmed: status === "CONFIRMED",
    castVote: vi.fn(async () => {}),
    reset: vi.fn(),
    ...overrides,
  };
}

function renderDialog(voting: UseVotingResult, props: Partial<{
  isWrongNetwork: boolean;
  onSwitchNetwork: () => void;
  onConfirmed: () => void;
  open: boolean;
}> = {}) {
  const onClose = vi.fn();
  render(
    <VoteConfirmDialog
      open={props.open ?? true}
      onClose={onClose}
      electionId={1}
      candidate={candidate}
      contractAddress={contractAddress}
      voting={voting}
      isWrongNetwork={props.isWrongNetwork ?? false}
      onSwitchNetwork={props.onSwitchNetwork ?? vi.fn()}
      onConfirmed={props.onConfirmed ?? vi.fn()}
    />,
  );
  return { onClose };
}

describe("VoteConfirmDialog", () => {
  it("shows the confirm action and casts the real vote on CONFIRM VOTE", async () => {
    const voting = makeVoting("IDLE");
    renderDialog(voting);

    const confirm = screen.getByTestId("confirm-vote");
    expect(confirm).toBeEnabled();
    confirm.click();

    expect(voting.castVote).toHaveBeenCalledWith(1, 2, contractAddress);
  });

  it("disables CONFIRM VOTE on the wrong network", () => {
    renderDialog(makeVoting("IDLE"), { isWrongNetwork: true });
    expect(screen.getByTestId("confirm-vote")).toBeDisabled();
    expect(screen.getByTestId("dialog-switch-network")).toBeInTheDocument();
  });

  it("renders in-flight progress and the transaction hash while busy", () => {
    renderDialog(
      makeVoting("AWAITING_WALLET", {
        txHash: `0x${"b".repeat(64)}`,
      }),
    );

    expect(screen.getByTestId("vote-progress")).toBeInTheDocument();
    expect(screen.getByText("AWAITING WALLET CONFIRMATION")).toBeInTheDocument();
    expect(screen.getByTestId("tx-hash")).toHaveTextContent("0xbbbb");
  });

  it("renders the confirmed terminal state with a transaction link", () => {
    const onConfirmed = vi.fn();
    renderDialog(
      makeVoting("CONFIRMED", {
        txHash: `0x${"c".repeat(64)}`,
        receipt: {
          transactionHash: `0x${"c".repeat(64)}`,
          blockNumber: 42n,
          gasUsed: 21000n,
          status: "success",
        },
      }),
      { onConfirmed },
    );

    expect(screen.getByTestId("vote-confirmed")).toBeInTheDocument();
    expect(screen.getByTestId("view-transaction")).toBeInTheDocument();
    expect(onConfirmed).toHaveBeenCalled();
  });

  it("renders the rejected terminal state (never an endless spinner)", () => {
    renderDialog(
      makeVoting("REJECTED", {
        error: {
          title: "Transaction rejected",
          message: "You rejected the transaction in your wallet.",
          rawMessage: "User rejected the request",
          kind: "user-rejected",
        },
      }),
    );

    expect(screen.getByTestId("vote-rejected")).toBeInTheDocument();
    expect(screen.getByTestId("retry-vote")).toBeInTheDocument();
  });

  it("renders the failed terminal state with expandable technical details", () => {
    renderDialog(
      makeVoting("FAILED", {
        error: {
          title: "Transaction reverted",
          message: "The contract rejected the transaction.",
          rawMessage: "execution reverted: AlreadyVoted()",
          kind: "reverted",
        },
      }),
    );

    expect(screen.getByTestId("vote-failed")).toBeInTheDocument();
    expect(screen.getByText("Technical details")).toBeInTheDocument();
  });
});
