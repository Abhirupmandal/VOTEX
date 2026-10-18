"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Users,
  Vote,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminElections } from "@/hooks/useAdminElections";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuditEvents } from "@/hooks/useAudit";
import { useBlockchain } from "@/hooks/useBlockchain";
import { useGuardianStatus } from "@/hooks/useGuardian";
import { cn } from "@/lib/utils";
import { ROLE_LIST } from "@/lib/admin/roles";
import { formatDateTime } from "@/lib/formatting";

function StatTile({
  label,
  value,
  icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  hint?: string;
  tone?: "default" | "warning" | "success";
}) {
  return (
    <Card className="flex items-start justify-between gap-3" data-testid="stat-tile">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border",
          tone === "warning"
            ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
            : tone === "success"
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
              : "border-border bg-card/60 text-primary",
        )}
      >
        {icon}
      </span>
    </Card>
  );
}

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | null;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{detail}</span>
        {ok === null ? (
          <Activity className="h-4 w-4 text-muted-foreground" />
        ) : ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400" />
        )}
      </span>
    </div>
  );
}

/** Admin overview (§4): real on-chain totals, system status, recent activity. */
export default function AdminDashboardPage() {
  const admin = useAdminRoles();
  const elections = useAdminElections();
  const chain = useBlockchain();
  const guardian = useGuardianStatus();
  const audit = useAuditEvents({ pageSize: 8 });
  const { refetch: refetchAudit } = audit;

  const heldRoles = useMemo(
    () => ROLE_LIST.filter((role) => admin.roles[role.key]),
    [admin.roles],
  );

  const isLoading = elections.isLoading;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Admin Control Center"
        title="Overview"
        description="Authoritative on-chain figures for this VOTEX deployment, plus live backend and indexer health. All counts are read directly from the contracts."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              elections.refetch();
              chain.refetch();
              guardian.refetch();
              refetchAudit();
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </Button>
        }
      />

      {elections.error ? (
        <Alert variant="danger" title="Could not read elections from the chain">
          {elections.error.message}
        </Alert>
      ) : null}

      {/* Primary Stat Tiles (All 13 Real Metrics) */}
      <div className="space-y-4">
        <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
          Platform Metrics & Election States (On-Chain Single Source of Truth)
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatTile
                label="Total Elections"
                value={elections.counts.total}
                icon={<Vote className="h-4 w-4" />}
                hint="Factory instances"
              />
              <StatTile
                label="Active Elections"
                value={elections.counts.active}
                icon={<Gauge className="h-4 w-4" />}
                tone={elections.counts.active > 0 ? "success" : "default"}
                hint="Live voting window"
              />
              <StatTile
                label="Registration"
                value={elections.counts.registration}
                icon={<Users className="h-4 w-4" />}
                hint="Enrolment open"
              />
              <StatTile
                label="Paused"
                value={elections.counts.paused}
                icon={<AlertTriangle className="h-4 w-4" />}
                tone={elections.counts.paused > 0 ? "warning" : "default"}
                hint="Emergency halted"
              />
              <StatTile
                label="Ended"
                value={elections.counts.ended}
                icon={<CheckCircle2 className="h-4 w-4" />}
                hint="Voting closed"
              />
              <StatTile
                label="Finalized"
                value={elections.counts.finalized}
                icon={<ShieldCheck className="h-4 w-4" />}
                hint="Tallies certified"
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {isLoading ? (
            Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatTile
                label="Registered Voters"
                value={elections.totalRegisteredVoters.toLocaleString()}
                icon={<Users className="h-4 w-4" />}
                hint="Total authorized"
              />
              <StatTile
                label="Total Votes Cast"
                value={elections.totalVotes.toLocaleString()}
                icon={<Vote className="h-4 w-4" />}
                hint="Confirmed on-chain"
              />
              <StatTile
                label="Average Turnout"
                value={
                  elections.totalRegisteredVoters > 0
                    ? `${((elections.totalVotes / elections.totalRegisteredVoters) * 100).toFixed(1)}%`
                    : "0.0%"
                }
                icon={<Activity className="h-4 w-4" />}
                hint="Participation rate"
              />
              <StatTile
                label="Candidates"
                value={elections.totalCandidates}
                icon={<Users className="h-4 w-4" />}
                hint="Enrolled on-chain"
              />
              <StatTile
                label="Active Alerts"
                value={
                  guardian.status
                    ? guardian.status.active_alerts
                    : guardian.error
                      ? "DATA UNAVAILABLE"
                      : "…"
                }
                icon={<AlertTriangle className="h-4 w-4" />}
                tone={guardian.status?.active_alerts ? "warning" : "default"}
                hint="Advisory AI signals"
              />
              <StatTile
                label="Highest AI Risk"
                value={
                  guardian.status
                    ? `${guardian.status.risk_score} / 100`
                    : guardian.error
                      ? "DATA UNAVAILABLE"
                      : "…"
                }
                icon={<Activity className="h-4 w-4" />}
                tone={
                  guardian.status && ["HIGH", "CRITICAL"].includes(guardian.status.threat_level)
                    ? "warning"
                    : "success"
                }
                hint={guardian.status?.threat_level ?? "Supervisory"}
              />
              <StatTile
                label="Indexer Sync"
                value={
                  chain.status.loading
                    ? "Checking…"
                    : chain.status.syncStatus
                      ? chain.status.syncStatus.toUpperCase()
                      : "DATA UNAVAILABLE"
                }
                icon={<Boxes className="h-4 w-4" />}
                tone={
                  chain.status.syncStatus?.toLowerCase() === "synced"
                    ? "success"
                    : "default"
                }
                hint={
                  typeof chain.status.eventsIndexed === "number"
                    ? `${chain.status.eventsIndexed} indexed events`
                    : "Read model status"
                }
              />
            </>
          )}
        </div>
      </div>


      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* System status */}
        <Card className="space-y-4" data-testid="system-status-card">
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" aria-hidden />
            System status
          </CardTitle>
          <div className="space-y-3">
            <StatusRow
              label="Chain connection (backend)"
              ok={chain.status.backendReachable ? chain.status.connected : null}
              detail={
                chain.status.loading
                  ? "checking…"
                  : chain.status.connected
                    ? `block #${chain.status.latestBlock ?? "—"}`
                    : "unreachable"
              }
            />
            <StatusRow
              label="Indexer sync"
              ok={
                chain.status.syncStatus
                  ? chain.status.syncStatus.toLowerCase() === "synced"
                  : null
              }
              detail={
                chain.status.syncStatus
                  ? `${chain.status.syncStatus}${
                      typeof chain.status.eventsIndexed === "number"
                        ? ` · ${chain.status.eventsIndexed} events`
                        : ""
                    }`
                  : "—"
              }
            />
            <StatusRow
              label="Wallet network"
              ok={chain.isSupportedNetwork}
              detail={chain.networkName}
            />
            <StatusRow
              label="Factory configured"
              ok={chain.factoryError ? false : chain.totalElections !== undefined}
              detail={
                chain.factoryError
                  ? "read failed"
                  : chain.totalElections !== undefined
                    ? `${chain.totalElections.toString()} on-chain`
                    : "not configured"
              }
            />
          </div>
          {chain.status.error ? (
            <p className="text-xs text-amber-400">
              Backend warning: {chain.status.error}
            </p>
          ) : null}
        </Card>

        {/* Your access */}
        <Card className="space-y-4" data-testid="access-card">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            Your access
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Role membership is read from VotexAccessManager on-chain. The contract
            is the security boundary; this list reflects what the chain reports.
          </p>
          <div className="flex flex-wrap gap-2">
            {heldRoles.length ? (
              heldRoles.map((role) => (
                <Badge key={role.key} variant="default">
                  {role.label}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No roles held.</span>
            )}
          </div>
          {admin.isSuperAdmin ? (
            <Alert variant="warning" title="Super-admin">
              This wallet can grant and revoke every other role. Use with care.
            </Alert>
          ) : null}
        </Card>
      </div>

      {/* Recent activity */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Recent indexed activity
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/audit">View full audit trail →</Link>
          </Button>
        </div>
        {audit.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : audit.error ? (
          <Alert variant="warning" title="Audit index unavailable">
            The indexer did not return events. On-chain state is unaffected.
          </Alert>
        ) : audit.events.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Register a voter or create an election and the events will appear here as the indexer processes them."
          />
        ) : (
          <Card className="divide-y divide-border/60 p-0">
            {audit.events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="muted">{event.event_type}</Badge>
                  <span className="text-muted-foreground">
                    block #{event.block_number}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(
                    event.timestamp
                      ? new Date(event.timestamp * 1000).toISOString()
                      : event.created_at,
                  )}
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {guardian.error ? (
        <Alert variant="info" title="Guardian unavailable">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-3 w-3" />
            The AI Guardian service did not respond. Its advisory signals are
            optional and do not affect on-chain administration.
          </span>
        </Alert>
      ) : null}
    </div>
  );
}
