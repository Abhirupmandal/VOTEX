"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck2,
  Flame,
  Layers,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField, inputClassName } from "@/components/admin/form-field";
import { TransactionStatus } from "@/components/admin/transaction-status";
import { useAdminElections } from "@/hooks/useAdminElections";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useEmergency } from "@/hooks/useEmergency";
import {
  useElectionAlerts,
  useElectionFeatures,
  useElectionRisk,
  useGuardianStatus,
  useTriggerAnalysis,
} from "@/hooks/useGuardian";
import { formatDateTime, formatTimestamp, shortenAddress, shortenHash } from "@/lib/formatting";
import type { AIAlertOut } from "@/types";

/** Map a Guardian threat level to a badge tone (advisory presentation only). */
function threatTone(level: string): "default" | "success" | "warning" | "danger" {
  switch (level?.toUpperCase()) {
    case "CRITICAL":
      return "danger";
    case "HIGH":
      return "warning";
    case "ELEVATED":
      return "default";
    default:
      return "success";
  }
}

export default function AdminSecurityPage() {
  const admin = useAdminRoles();
  const elections = useAdminElections();
  const emergencyTx = useEmergency();
  const guardian = useGuardianStatus();

  // Selected election
  const [selectedElectionId, setSelectedElectionId] = useState<number | undefined>(undefined);

  // Initialize selectedElectionId once elections load if none selected
  useMemo(() => {
    if (selectedElectionId === undefined && elections.elections.length > 0) {
      setSelectedElectionId(elections.elections[0].electionId);
    }
  }, [selectedElectionId, elections.elections]);

  const selectedElection = useMemo(
    () => elections.elections.find((e) => e.electionId === selectedElectionId),
    [elections.elections, selectedElectionId],
  );

  // Per-election risk & alerts hooks
  const risk = useElectionRisk(selectedElectionId);
  const [alertStatusTab, setAlertStatusTab] = useState<string>("OPEN");
  const alertsQuery = useElectionAlerts({
    electionId: selectedElectionId,
    status: alertStatusTab === "ALL" ? undefined : alertStatusTab,
  });

  // Telemetry features hook
  const featuresQuery = useElectionFeatures(selectedElectionId, 15);

  // Trigger analysis mutation
  const analysisTrigger = useTriggerAnalysis(selectedElectionId);

  // Selected Alert for Details Modal
  const [inspectAlert, setInspectAlert] = useState<AIAlertOut | null>(null);

  // Emergency pause/resume handlers
  const canPause = admin.roles.SECURITY_OFFICER_ROLE;
  const isPaused = selectedElection?.stateName === "PAUSED";
  const [emergencyPending, setEmergencyPending] = useState<"pause" | "resume" | null>(null);

  const handlePause = async () => {
    if (selectedElectionId === undefined) return;
    setEmergencyPending("pause");
    const ok = await emergencyTx.pauseElection(selectedElectionId);
    setEmergencyPending(null);
    if (ok) {
      elections.refetch();
      risk.refetch();
      alertsQuery.refetch();
    }
  };

  const handleResume = async () => {
    if (selectedElectionId === undefined) return;
    setEmergencyPending("resume");
    const ok = await emergencyTx.resumeElection(selectedElectionId);
    setEmergencyPending(null);
    if (ok) {
      elections.refetch();
      risk.refetch();
      alertsQuery.refetch();
    }
  };

  const handleTriggerAnalysis = async () => {
    await analysisTrigger.trigger();
    risk.refetch();
    alertsQuery.refetch();
    featuresQuery.refetch();
  };

  const refreshAll = () => {
    guardian.refetch();
    elections.refetch();
    risk.refetch();
    alertsQuery.refetch();
    featuresQuery.refetch();
  };

  const isHighOrCritical =
    risk.risk?.threat_level === "HIGH" || risk.risk?.threat_level === "CRITICAL";

  return (
    <div className="flex flex-col gap-8">
      {/* Page Header */}
      <PageHeader
        eyebrow="Security Officer · AI SOC"
        title="Security Operations Center"
        description="Real-time election supervision, grounded statistical anomaly explainability, and authorized circuit breakers. Every state mutation is a real on-chain transaction; the AI Guardian is supervisory only."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={analysisTrigger.isRunning || selectedElectionId === undefined}
              onClick={handleTriggerAnalysis}
            >
              <Sparkles className="h-4 w-4 mr-1 text-primary" />
              {analysisTrigger.isRunning ? "Analyzing…" : "Run Analysis Pass"}
            </Button>
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Supervisory Boundary Banner */}
      <Alert
        variant="warning"
        title="SUPERVISORY BOUNDARY: AI OBSERVES, NEVER GOVERNS"
        data-testid="supervisory-boundary-banner"
      >
        <span className="flex items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-amber-400" />
          The AI Election Guardian observes the indexed read model, scores risk, and raises
          advisory alerts. It <strong>never</strong> alters tallies, casts votes, or executes
          automatic actions. Pausing an election requires a human Security Officer transaction
          confirmed in a Web3 wallet. An anomaly is an integrity signal, not legal proof of fraud.
        </span>
      </Alert>

      {/* Aggregate Guardian Status Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-4 space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            Guardian Status
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                guardian.status ? "bg-emerald-400 animate-pulse" : "bg-red-400"
              }`}
            />
            <span className="font-bold text-sm">
              {guardian.isLoading ? "Checking…" : guardian.status ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">
            {guardian.status?.model_version ?? "v0.4.0-guardian"}
          </p>
        </Card>

        <Card className="p-4 space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            Network Risk Score
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold font-mono">
              {guardian.status ? guardian.status.risk_score : "—"}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          <Badge
            variant={
              guardian.status ? threatTone(guardian.status.threat_level) : "muted"
            }
          >
            {guardian.status?.threat_level ?? "CALIBRATING"}
          </Badge>
        </Card>

        <Card className="p-4 space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            Active Alerts
          </p>
          <p className="text-xl font-bold font-mono text-amber-400">
            {guardian.status ? guardian.status.active_alerts : "0"}
          </p>
          <p className="text-[10px] text-muted-foreground">Across all elections</p>
        </Card>

        <Card className="p-4 space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            Monitored Elections
          </p>
          <p className="text-xl font-bold font-mono">
            {guardian.status ? guardian.status.elections_monitored : elections.counts.total}
          </p>
          <p className="text-[10px] text-muted-foreground">Active in read model</p>
        </Card>

        <Card className="p-4 space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            Last Analysis Pass
          </p>
          <p className="text-xs font-medium">
            {guardian.status?.last_analysis
              ? formatDateTime(guardian.status.last_analysis)
              : "Continuous"}
          </p>
          <p className="text-[10px] text-muted-foreground">Bounded background pass</p>
        </Card>

        <Card className="p-4 space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            Supervisory Boundary
          </p>
          <Badge variant="success" className="w-fit">
            ENFORCED ✓
          </Badge>
          <p className="text-[10px] text-muted-foreground">Non-deciding observer</p>
        </Card>
      </div>

      {/* Target Election Selector & Emergency Controls */}
      <Card className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Target Election Supervision & Controls</CardTitle>
              <p className="text-xs text-muted-foreground">
                Select an election instance to inspect telemetry, review alerts, or invoke emergency pause.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Target Election"
              className={inputClassName}
              value={selectedElectionId ?? ""}
              onChange={(e) =>
                setSelectedElectionId(e.target.value ? Number(e.target.value) : undefined)
              }
            >
              {elections.elections.map((row) => (
                <option key={row.electionId} value={row.electionId}>
                  #{row.electionId} · {row.title || "Untitled"} ({row.stateName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedElection ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base">
                    #{selectedElection.electionId} · {selectedElection.title}
                  </h3>
                  <Badge variant={isPaused ? "warning" : "default"}>
                    {selectedElection.stateName}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {shortenAddress(selectedElection.address)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Voting window: {formatTimestamp(selectedElection.votingStart)} →{" "}
                  {formatTimestamp(selectedElection.votingEnd)} · Recorded votes:{" "}
                  <strong className="text-foreground">{selectedElection.totalVotes}</strong>
                </p>
              </div>

              {/* Human-in-the-loop Emergency Pause/Resume */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canPause || emergencyTx.isBusy || isPaused || selectedElection.stateName !== "ACTIVE"}
                  onClick={handlePause}
                >
                  <PauseCircle className="h-4 w-4 mr-1 text-amber-400" />
                  {emergencyPending === "pause" ? "Signing…" : "Pause Election"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canPause || emergencyTx.isBusy || !isPaused}
                  onClick={handleResume}
                >
                  <PlayCircle className="h-4 w-4 mr-1 text-emerald-400" />
                  {emergencyPending === "resume" ? "Signing…" : "Resume Election"}
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/admin/audit?electionId=${selectedElection.electionId}`}>
                    Audit Log
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>

            <TransactionStatus
              status={emergencyTx.status}
              txHash={emergencyTx.txHash}
              receipt={emergencyTx.receipt}
              error={emergencyTx.error}
            />
          </div>
        ) : null}
      </Card>

      {/* Main SOC Layout: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Risk Assessment & Grounded Explainability */}
        <div className="space-y-6 lg:col-span-2">
          {/* Risk Overview Card */}
          <Card className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TriangleAlert className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">
                  Election #{selectedElectionId} Risk Overview
                </CardTitle>
              </div>
              <Badge variant="muted">ON-CHAIN SUPERVISED</Badge>
            </div>

            {risk.isLoading ? (
              <Skeleton className="h-28" />
            ) : risk.risk ? (
              <div className="space-y-5">
                {/* Prominent High/Critical Banner */}
                {isHighOrCritical ? (
                  <div
                    className="p-4 rounded-lg border border-red-500/50 bg-red-500/10 space-y-2"
                    data-testid="critical-investigation-banner"
                  >
                    <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                      <AlertOctagon className="h-5 w-5 animate-bounce" />
                      SECURITY ALERT: HUMAN INVESTIGATION REQUIRED
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The AI Guardian detected anomalous behavioural metrics exceeding baseline
                      statistical bounds. Review the contributing signals below and cross-examine the
                      on-chain audit log before considering any emergency response.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/audit?electionId=${selectedElectionId}`}>
                          View Blockchain Audit
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/elections/${selectedElectionId}`}>
                          View Public Election
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Score & Dial */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border border-border/60 bg-muted/10">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Assessed Risk Score
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-mono font-extrabold">
                        {risk.risk.risk_score}
                      </span>
                      <span className="text-xs text-muted-foreground">/ 100</span>
                    </div>
                    <Badge variant={threatTone(risk.risk.threat_level)}>
                      {risk.risk.threat_level}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Supervision State
                    </p>
                    <p className="font-semibold text-sm">{risk.risk.guardian_status}</p>
                    <p className="text-xs text-muted-foreground">
                      {risk.risk.active_alerts} active alert(s)
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Recommendation
                    </p>
                    <p className="text-xs font-medium text-amber-400">
                      {risk.risk.recommendation ?? "Maintain continuous monitoring"}
                    </p>
                  </div>
                </div>

                <Progress value={Math.min(100, Math.max(0, risk.risk.risk_score))} />

                {/* Grounded Explainability Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Grounded Signal Contributions & Explanations
                  </h4>

                  {risk.risk.signals && risk.risk.signals.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border border-border/60">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-border/60 bg-muted/30 text-muted-foreground uppercase font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">Signal Detector</th>
                            <th className="py-2.5 px-3">Severity</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Grounded Detail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-mono">
                          {risk.risk.signals.map((sig, idx) => (
                            <tr key={idx} className="hover:bg-muted/20">
                              <td className="py-2.5 px-3 font-semibold text-foreground font-sans">
                                {String(sig.label ?? sig.name ?? "Signal")}
                              </td>
                              <td className="py-2.5 px-3">
                                {typeof sig.severity === "number"
                                  ? `${(sig.severity * 100).toFixed(0)}%`
                                  : typeof sig.value === "number"
                                    ? sig.value.toFixed(2)
                                    : "—"}
                              </td>
                              <td className="py-2.5 px-3 font-sans">
                                <Badge variant={sig.anomalous ? "danger" : "muted"}>
                                  {sig.anomalous ? "Anomalous" : "Normal"}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 font-sans text-muted-foreground text-xs max-w-xs">
                                {sig.detail || "Operating within expected empirical distribution"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No anomalous signals detected during the current observation window.
                    </p>
                  )}

                  {risk.risk.explanation?.summary ? (
                    <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
                      <span className="font-semibold text-foreground">Summary: </span>
                      {risk.risk.explanation.summary}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Activity className="h-8 w-8" />}
                title="No risk assessment"
                description="Trigger an on-demand analysis pass above to generate the first supervisory risk report."
              />
            )}
          </Card>

          {/* Alert Center */}
          <Card className="space-y-4" data-testid="alert-center-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <CardTitle className="text-base">
                  Security Alert Center ({alertsQuery.total})
                </CardTitle>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-md text-xs">
                {(["OPEN", "ACKNOWLEDGED", "RESOLVED", "ALL"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setAlertStatusTab(tab)}
                    className={`px-2.5 py-1 rounded transition-colors font-medium ${
                      alertStatusTab === tab
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {alertsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : alertsQuery.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No {alertStatusTab !== "ALL" ? alertStatusTab.toLowerCase() : ""} alerts found for
                election #{selectedElectionId}.
              </p>
            ) : (
              <div className="divide-y divide-border/60 rounded-md border border-border/60">
                {alertsQuery.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 text-sm hover:bg-muted/20"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={threatTone(alert.threat_level)}>
                          {alert.threat_level}
                        </Badge>
                        <h5 className="font-semibold text-sm">{alert.title}</h5>
                        <span className="font-mono text-xs text-muted-foreground">
                          Score {alert.risk_score}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {alert.description}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Detected: {formatDateTime(alert.detected_at)} · Status:{" "}
                        <strong className="text-foreground">{alert.status}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspectAlert(alert)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Details
                      </Button>

                      {alert.status === "OPEN" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={alertsQuery.isMutating}
                          onClick={() => alertsQuery.acknowledge(alert.id)}
                        >
                          Acknowledge
                        </Button>
                      ) : null}

                      {alert.status !== "RESOLVED" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={alertsQuery.isMutating}
                          onClick={() => alertsQuery.resolve(alert.id)}
                        >
                          Resolve
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column (1 Col): Live Telemetry & Security Timeline */}
        <div className="space-y-6">
          {/* Live Telemetry Feature Snapshot */}
          <Card className="space-y-4" data-testid="live-telemetry-card">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Real-Time Event Telemetry</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              Feature vectors extracted from indexed on-chain events by the backend AI service.
            </p>

            {featuresQuery.isLoading ? (
              <Skeleton className="h-32" />
            ) : featuresQuery.features?.items?.length ? (
              <div className="space-y-3 font-mono text-xs">
                {featuresQuery.features.items.slice(-1).map((feat) => (
                  <div key={feat.id} className="space-y-2 p-3 rounded-lg border border-border/60 bg-muted/20">
                    <div className="flex justify-between text-muted-foreground text-[10px] uppercase">
                      <span>Window End</span>
                      <span>{formatTimestamp(feat.window_end)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-sans">Vote Velocity</span>
                      <span className="font-bold">{feat.voting_velocity.toFixed(2)} votes/s</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-sans">Unique Voters</span>
                      <span className="font-bold">{feat.unique_voters}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-sans">Interarrival (Mean)</span>
                      <span>
                        {feat.mean_interarrival ? `${feat.mean_interarrival.toFixed(2)}s` : "—"}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-sans">Candidate Entropy</span>
                      <span>
                        {feat.candidate_entropy ? feat.candidate_entropy.toFixed(3) : "—"}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-sans">Velocity Z-Score</span>
                      <span
                        className={
                          (feat.velocity_zscore ?? 0) > 2 ? "text-amber-400 font-bold" : ""
                        }
                      >
                        {feat.velocity_zscore ? feat.velocity_zscore.toFixed(2) : "0.00"}
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground font-sans">
                  Total snapshots recorded: {featuresQuery.features.observations}. Calibrating:{" "}
                  {featuresQuery.features.calibrating ? "Yes" : "No"}.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No telemetry snapshots recorded yet. Cast ballots to populate feature vectors.
              </p>
            )}
          </Card>

          {/* Security Event Timeline */}
          <Card className="space-y-4" data-testid="security-timeline-card">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Security Event Pipeline</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              End-to-end data pipeline demonstrating how VOTEX reconciles blockchain immutability with supervisory AI.
            </p>

            <ol className="relative border-l border-border/80 ml-3 space-y-4 text-xs">
              <li className="ml-4 space-y-0.5">
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-primary bg-background" />
                <h5 className="font-semibold text-foreground">1. On-Chain Event</h5>
                <p className="text-muted-foreground text-[11px]">
                  EVM transactions emit VoteCast or lifecycle logs.
                </p>
              </li>

              <li className="ml-4 space-y-0.5">
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-primary bg-background" />
                <h5 className="font-semibold text-foreground">2. Backend Indexer</h5>
                <p className="text-muted-foreground text-[11px]">
                  Continuous listener ingests logs idempotently into PostgreSQL.
                </p>
              </li>

              <li className="ml-4 space-y-0.5">
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-primary bg-background" />
                <h5 className="font-semibold text-foreground">3. Feature Snapshot</h5>
                <p className="text-muted-foreground text-[11px]">
                  Calculates velocity, inter-arrival variance, entropy, and gas.
                </p>
              </li>

              <li className="ml-4 space-y-0.5">
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-primary bg-background" />
                <h5 className="font-semibold text-foreground">4. Isolation Forest & Statistical Scoring</h5>
                <p className="text-muted-foreground text-[11px]">
                  Evaluates deviation from baseline and assigns 0–100 risk score.
                </p>
              </li>

              <li className="ml-4 space-y-0.5">
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-primary bg-background" />
                <h5 className="font-semibold text-foreground">5. Advisory Alert Raised</h5>
                <p className="text-muted-foreground text-[11px]">
                  Persists alert with grounded features and human recommendation.
                </p>
              </li>

              <li className="ml-4 space-y-0.5">
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-emerald-400 bg-emerald-400" />
                <h5 className="font-semibold text-foreground">6. Human Administrator Action</h5>
                <p className="text-muted-foreground text-[11px]">
                  Officer acknowledges, investigates, or pauses via real Web3 tx.
                </p>
              </li>
            </ol>
          </Card>
        </div>
      </div>

      {/* Alert Details Modal */}
      {inspectAlert ? (
        <Dialog
          open={Boolean(inspectAlert)}
          onClose={() => setInspectAlert(null)}
          title={`Security Alert #${inspectAlert.id} Details`}
          description={`Advisory anomaly report detected for Election #${inspectAlert.election_id}.`}
        >
          <div className="space-y-4 pt-2">
            {inspectAlert.threat_level === "CRITICAL" || inspectAlert.threat_level === "HIGH" ? (
              <div className="p-3 rounded-md border border-red-500/40 bg-red-500/10 text-red-400 font-semibold text-xs flex items-center gap-2">
                <AlertOctagon className="h-4 w-4" />
                SECURITY ALERT: HUMAN INVESTIGATION REQUIRED
              </div>
            ) : null}

            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-0.5">
                <dt className="text-muted-foreground uppercase tracking-widest text-[10px]">
                  Alert Type
                </dt>
                <dd className="font-semibold">{inspectAlert.alert_type}</dd>
              </div>

              <div className="space-y-0.5">
                <dt className="text-muted-foreground uppercase tracking-widest text-[10px]">
                  Threat Level & Score
                </dt>
                <dd className="flex items-center gap-2">
                  <Badge variant={threatTone(inspectAlert.threat_level)}>
                    {inspectAlert.threat_level}
                  </Badge>
                  <span className="font-mono">{inspectAlert.risk_score} / 100</span>
                </dd>
              </div>

              <div className="space-y-0.5">
                <dt className="text-muted-foreground uppercase tracking-widest text-[10px]">
                  Detected Timestamp
                </dt>
                <dd className="font-mono">{formatDateTime(inspectAlert.detected_at)}</dd>
              </div>

              <div className="space-y-0.5">
                <dt className="text-muted-foreground uppercase tracking-widest text-[10px]">
                  Status
                </dt>
                <dd className="font-semibold">{inspectAlert.status}</dd>
              </div>

              <div className="col-span-2 space-y-0.5">
                <dt className="text-muted-foreground uppercase tracking-widest text-[10px]">
                  Title & Description
                </dt>
                <dd className="text-foreground">{inspectAlert.title}</dd>
                <dd className="text-muted-foreground text-[11px] pt-1">
                  {inspectAlert.description}
                </dd>
              </div>

              {inspectAlert.metadata && Object.keys(inspectAlert.metadata).length > 0 ? (
                <div className="col-span-2 space-y-1">
                  <dt className="text-muted-foreground uppercase tracking-widest text-[10px]">
                    Observed Metadata
                  </dt>
                  <pre className="p-2 rounded bg-muted/30 font-mono text-[11px] overflow-x-auto max-h-32">
                    {JSON.stringify(inspectAlert.metadata, null, 2)}
                  </pre>
                </div>
              ) : null}
            </dl>

            <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
              {inspectAlert.status === "OPEN" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await alertsQuery.acknowledge(inspectAlert.id);
                    setInspectAlert(null);
                  }}
                >
                  Acknowledge Alert
                </Button>
              ) : null}

              {inspectAlert.status !== "RESOLVED" ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    await alertsQuery.resolve(inspectAlert.id);
                    setInspectAlert(null);
                  }}
                >
                  Resolve Alert
                </Button>
              ) : null}

              <Button size="sm" variant="ghost" onClick={() => setInspectAlert(null)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
