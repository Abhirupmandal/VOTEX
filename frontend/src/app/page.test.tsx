import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

import HomePage from "@/app/page";
import { Providers } from "@/app/providers";

/** Render a component inside the app's wallet + query providers. */
function renderWithProviders(ui: ReactElement) {
  return render(<Providers>{ui}</Providers>);
}

describe("Landing page", () => {
  it("renders the VOTEX title", () => {
    renderWithProviders(<HomePage />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("VOTEX");
  });

  it("renders the tagline", () => {
    renderWithProviders(<HomePage />);
    expect(
      screen.getByText(
        "Trustless elections. Verifiable integrity. Transparent governance.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the system status board", () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByText("Live System Status")).toBeInTheDocument();
    expect(screen.getByText("DEVELOPMENT / LOCAL NETWORK")).toBeInTheDocument();
  });

  it("renders a connect wallet control", () => {
    renderWithProviders(<HomePage />);
    expect(screen.getAllByText("Connect Wallet").length).toBeGreaterThan(0);
  });

  it("renders the how-it-works steps", () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByText("VERIFY")).toBeInTheDocument();
    expect(screen.getByText("VOTE")).toBeInTheDocument();
    expect(screen.getByText("VERIFY ON-CHAIN")).toBeInTheDocument();
  });
});
