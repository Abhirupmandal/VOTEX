"use client";

/**
 * AI Election Guardian surface (Phase 6 §15).
 *
 * The Guardian is ADVISORY. This hook only READS real values from the backend
 * (risk score, threat level, signals, active alerts). It never exposes — and the
 * admin UI never wires — an automatic pause. Pausing is a human decision that
 * flows exclusively through {@link useEmergency}.
 */

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acknowledgeAlert,
  getElectionFeatures,
  getElectionRisk,
  getGuardianStatus,
  listElectionAlerts,
  resolveAlert,
  triggerAIAnalysis,
} from "@/lib/api";
import type {
  AIAlertOut,
  AIAnalysisOut,
  AIFeaturesOut,
  AIRiskOut,
  GuardianStatusOut,
  PaginatedAlerts,
} from "@/types";

export interface UseGuardianStatusResult {
  status: GuardianStatusOut | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Aggregate guardian status (dashboard tiles). */
export function useGuardianStatus(): UseGuardianStatusResult {
  const query = useQuery({
    queryKey: ["guardian-status"],
    queryFn: ({ signal }) => getGuardianStatus({ signal }),
    refetchInterval: 20_000,
    retry: 1,
  });

  return {
    status: query.data,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface UseElectionRiskResult {
  risk: AIRiskOut | undefined;
  alerts: AIAlertOut[];
  activeAlerts: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Per-election risk assessment + active alerts (security center). */
export function useElectionRisk(electionId: number | undefined): UseElectionRiskResult {
  const enabled = electionId !== undefined;

  const riskQuery = useQuery({
    queryKey: ["election-risk", electionId],
    queryFn: ({ signal }) => getElectionRisk(electionId as number, { signal }),
    enabled,
    refetchInterval: 20_000,
    retry: 1,
  });

  const alertsQuery = useQuery({
    queryKey: ["election-alerts", electionId, "OPEN"],
    queryFn: ({ signal }) =>
      listElectionAlerts(electionId as number, { status: "OPEN", pageSize: 20 }, { signal }),
    enabled,
    refetchInterval: 20_000,
    retry: 1,
  });

  const alerts = alertsQuery.data?.items ?? [];
  const activeAlerts = alerts.filter((a) => a.status === "OPEN").length;

  return {
    risk: riskQuery.data,
    alerts,
    activeAlerts,
    isLoading: riskQuery.isLoading || alertsQuery.isLoading,
    error: (riskQuery.error as Error | null) ?? (alertsQuery.error as Error | null) ?? null,
    refetch: () => {
      void riskQuery.refetch();
      void alertsQuery.refetch();
    },
  };
}

export interface UseElectionAlertsParams {
  electionId: number | undefined;
  status?: string;
  threatLevel?: string;
  page?: number;
  pageSize?: number;
}

export interface UseElectionAlertsResult {
  data: PaginatedAlerts | undefined;
  alerts: AIAlertOut[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  acknowledge: (alertId: number) => Promise<boolean>;
  resolve: (alertId: number) => Promise<boolean>;
  isMutating: boolean;
}

/** Per-election full alerts listing with human acknowledge/resolve actions. */
export function useElectionAlerts(params: UseElectionAlertsParams): UseElectionAlertsResult {
  const queryClient = useQueryClient();
  const enabled = params.electionId !== undefined;
  const [isMutating, setIsMutating] = useState(false);

  const queryKey = [
    "election-alerts-paginated",
    params.electionId,
    params.status,
    params.threatLevel,
    params.page ?? 1,
  ];

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      listElectionAlerts(
        params.electionId as number,
        {
          status: params.status,
          threatLevel: params.threatLevel,
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 25,
        },
        { signal },
      ),
    enabled,
    refetchInterval: 15_000,
    retry: 1,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["election-alerts"] });
    void queryClient.invalidateQueries({ queryKey: ["election-alerts-paginated"] });
    void queryClient.invalidateQueries({ queryKey: ["election-risk", params.electionId] });
    void queryClient.invalidateQueries({ queryKey: ["guardian-status"] });
  }, [queryClient, params.electionId]);

  const ackMutation = useMutation({
    mutationFn: (alertId: number) => acknowledgeAlert(alertId),
    onSuccess: invalidate,
  });

  const resMutation = useMutation({
    mutationFn: (alertId: number) => resolveAlert(alertId),
    onSuccess: invalidate,
  });

  const acknowledge = useCallback(
    async (alertId: number) => {
      setIsMutating(true);
      try {
        await ackMutation.mutateAsync(alertId);
        return true;
      } catch {
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [ackMutation],
  );

  const resolve = useCallback(
    async (alertId: number) => {
      setIsMutating(true);
      try {
        await resMutation.mutateAsync(alertId);
        return true;
      } catch {
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [resMutation],
  );

  return {
    data: query.data,
    alerts: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
    acknowledge,
    resolve,
    isMutating,
  };
}

export interface UseElectionFeaturesResult {
  features: AIFeaturesOut | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Telemetry feature vector snapshots for an election. */
export function useElectionFeatures(
  electionId: number | undefined,
  limit: number = 20,
): UseElectionFeaturesResult {
  const enabled = electionId !== undefined;

  const query = useQuery({
    queryKey: ["election-features", electionId, limit],
    queryFn: ({ signal }) =>
      getElectionFeatures(electionId as number, limit, { signal }),
    enabled,
    refetchInterval: 20_000,
    retry: 1,
  });

  return {
    features: query.data,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface UseTriggerAnalysisResult {
  trigger: () => Promise<AIAnalysisOut | null>;
  isRunning: boolean;
  error: Error | null;
}

/** Trigger on-demand AI analysis pass. Supervisory and non-mutating on-chain. */
export function useTriggerAnalysis(
  electionId: number | undefined,
): UseTriggerAnalysisResult {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const trigger = useCallback(async () => {
    if (electionId === undefined) return null;
    setIsRunning(true);
    setError(null);
    try {
      const result = await triggerAIAnalysis(electionId);
      void queryClient.invalidateQueries({ queryKey: ["election-risk", electionId] });
      void queryClient.invalidateQueries({ queryKey: ["election-features", electionId] });
      void queryClient.invalidateQueries({ queryKey: ["election-alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["guardian-status"] });
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Analysis failed");
      setError(e);
      return null;
    } finally {
      setIsRunning(false);
    }
  }, [electionId, queryClient]);

  return { trigger, isRunning, error };
}

