import { test, expect } from "@playwright/test";

/**
 * Phase 1 end-to-end smoke tests.
 *
 * These assert the landing page renders and exposes the primary call to action.
 * Wallet-driven journeys (connect, vote, verify) arrive in later phases.
 */
test.describe("VOTEX landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the product title and tagline", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "VOTEX" }),
    ).toBeVisible();
    await expect(
      page.getByText("AI-Powered Decentralized Election Infrastructure"),
    ).toBeVisible();
  });

  test("exposes a wallet connect call to action", async ({ page }) => {
    const connect = page.getByTestId("connect-wallet");
    await expect(connect).toBeVisible();
    await expect(connect).toContainText("Connect Wallet");
  });

  test("renders the live system status panel", async ({ page }) => {
    await expect(page.getByText("Live System Status")).toBeVisible();
  });
});
