import type { Metadata } from "next";

import { ErrorBoundary } from "@/components/layout/error-boundary";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "VOTEX — Decentralized Election Infrastructure",
  description:
    "AI-powered secure and transparent decentralized e-voting platform. Trustless elections, verifiable integrity, transparent governance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans">
        {/* Keyboard users can skip repeated chrome (Phase 5 §21). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
        >
          Skip to main content
        </a>
        <Providers>
          <ErrorBoundary>{children}</ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
