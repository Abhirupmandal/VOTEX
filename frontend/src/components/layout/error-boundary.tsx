"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors so a single failing subtree cannot blank the whole
 * app (Phase 5 §19). Logs the error rather than hiding it.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the error to the console for diagnostics; never swallow it.
    console.error("VOTEX UI error boundary caught:", error, info);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div
        role="alert"
        data-testid="error-boundary"
        className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg glass p-8 text-center"
      >
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            This section failed to render. You can retry, or reload the page.
          </p>
        </div>
        <details className="w-full text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 font-mono">
            {error.message}
          </pre>
        </details>
        <Button variant="outline" size="sm" onClick={this.reset}>
          <RotateCcw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }
}
