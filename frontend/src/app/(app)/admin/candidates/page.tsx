"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField, inputClassName, textareaClassName } from "@/components/admin/form-field";
import { TransactionStatus } from "@/components/admin/transaction-status";
import { useAdminElections } from "@/hooks/useAdminElections";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useCandidateAdmin } from "@/hooks/useElectionAdmin";
import { useElection } from "@/hooks/useElection";
import { shortenAddress } from "@/lib/formatting";

export default function AdminCandidatesPage() {
  const admin = useAdminRoles();
  const searchParams = useSearchParams();
  const elections = useAdminElections();
  const tx = useCandidateAdmin();

  const initialElectionId = searchParams.get("electionId")
    ? Number(searchParams.get("electionId"))
    : undefined;

  const [selectedElectionId, setSelectedElectionId] = useState<number | undefined>(
    initialElectionId,
  );

  // Active election lookup
  const activeElectionRow = useMemo(
    () => elections.elections.find((e) => e.electionId === selectedElectionId),
    [elections.elections, selectedElectionId],
  );

  const { election, candidates, address, isLoading, error, refetch } = useElection(
    selectedElectionId,
  );

  // Add Candidate form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);

  const canManage = admin.roles.ELECTION_MANAGER_ROLE;
  const canAddCandidate =
    canManage && election && election.stateIndex < 2; // DRAFT (0) or REGISTRATION (1)


  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !address || selectedElectionId === undefined) return;

    const ok = await tx.addCandidate(
      address,
      selectedElectionId,
      name.trim(),
      description.trim(),
    );
    if (ok) {
      setName("");
      setDescription("");
      setTouched(false);
      refetch();
    }
  };

  const handleDeactivate = async (candidateId: number) => {
    if (!address || selectedElectionId === undefined) return;
    setDeactivatingId(candidateId);
    const ok = await tx.deactivateCandidate(address, selectedElectionId, candidateId);
    setDeactivatingId(null);
    if (ok) {
      refetch();
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Election Manager"
        title="Candidate Management"
        description="Register and manage candidates directly on deployed ElectionInstance contracts. Candidates are deactivated rather than deleted to ensure historical ballot immutability."
        actions={
          <Button variant="outline" onClick={() => { elections.refetch(); refetch(); }}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </Button>
        }
      />

      {!canManage ? (
        <Alert variant="warning" title="ELECTION_MANAGER_ROLE required">
          Candidate management calls `addCandidate` / `deactivateCandidate`, guarded by
          `onlyRole(ELECTION_MANAGER_ROLE)`. Your connected wallet must hold this role.
        </Alert>
      ) : null}

      {/* Election Selector */}
      <Card className="space-y-4">
        <CardTitle className="text-base">Select Target Election</CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <FormField label="Election" htmlFor="candidate-election-select" required>
            <select
              id="candidate-election-select"
              className={inputClassName}
              value={selectedElectionId ?? ""}
              onChange={(e) =>
                setSelectedElectionId(e.target.value ? Number(e.target.value) : undefined)
              }
            >
              <option value="">Select an election to manage candidates…</option>
              {elections.elections.map((row) => (
                <option key={row.electionId} value={row.electionId}>
                  #{row.electionId} · {row.title || "Untitled"} ({row.stateName})
                </option>
              ))}
            </select>
          </FormField>

          {activeElectionRow ? (
            <div className="flex items-center gap-3 text-sm pb-2">
              <span className="text-muted-foreground">State:</span>
              <Badge variant={activeElectionRow.stateName === "ACTIVE" ? "success" : "default"}>
                {activeElectionRow.stateName}
              </Badge>
              <span className="text-muted-foreground">Address:</span>
              <span className="font-mono text-xs">{shortenAddress(activeElectionRow.address)}</span>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/admin/elections/${activeElectionRow.electionId}`}>
                  Election Details
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {selectedElectionId !== undefined ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Candidate Form */}
          <Card className="space-y-5 lg:col-span-1" data-testid="add-candidate-card">
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" aria-hidden />
              Add Candidate
            </CardTitle>

            {!canAddCandidate ? (
              <Alert variant="info" title="Candidate entry closed">
                Candidates can only be enrolled while the election is in <strong>DRAFT</strong> or{" "}
                <strong>REGISTRATION</strong> state. Current state:{" "}
                <strong>{election?.stateName ?? "UNKNOWN"}</strong>.
              </Alert>
            ) : null}

            <form onSubmit={handleAdd} className="space-y-4">
              <FormField
                label="Candidate Name"
                htmlFor="cand-name"
                required
                error={touched && !name.trim() ? "Candidate name is required." : undefined}
              >
                <input
                  id="cand-name"
                  type="text"
                  placeholder="e.g. Dr. Jane Doe"
                  className={inputClassName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canAddCandidate || tx.isBusy}
                />
              </FormField>

              <FormField label="Description / Manifesto" htmlFor="cand-desc">
                <textarea
                  id="cand-desc"
                  rows={3}
                  placeholder="Platform manifesto, department, credentials…"
                  className={textareaClassName}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canAddCandidate || tx.isBusy}
                />
              </FormField>

              <Button
                type="submit"
                className="w-full"
                disabled={!canAddCandidate || tx.isBusy || !name.trim()}
              >
                {tx.isBusy ? "Submitting on-chain…" : "Enroll Candidate On-Chain"}
              </Button>
            </form>

            <TransactionStatus
              status={tx.status}
              txHash={tx.txHash}
              receipt={tx.receipt}
              error={tx.error}
            />
          </Card>

          {/* Candidate Roster */}
          <Card className="space-y-4 lg:col-span-2" data-testid="candidate-roster-card">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-primary" aria-hidden />
                Candidate Roster ({candidates.length})
              </CardTitle>
              <Badge variant="muted">ON-CHAIN VERIFIED ✓</Badge>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : candidates.length === 0 ? (
              <EmptyState
                icon={<UserX className="h-8 w-8" />}
                title="No candidates enrolled"
                description="No candidates have been registered for this election instance yet."
              />
            ) : (
              <div className="divide-y divide-border/60 rounded-md border border-border/60">
                {candidates.map((cand) => (
                  <div
                    key={cand.candidateId.toString()}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          #{cand.candidateId.toString()}
                        </span>
                        <h4 className="font-semibold text-base">{cand.name}</h4>
                        <Badge variant={cand.active ? "success" : "muted"}>
                          {cand.active ? "Active" : "Deactivated"}
                        </Badge>
                      </div>
                      {cand.description ? (
                        <p className="text-xs text-muted-foreground max-w-md">{cand.description}</p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          Votes
                        </p>
                        <p className="text-sm font-mono font-bold">{cand.voteCount.toString()}</p>
                      </div>

                      {cand.active && canManage ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={tx.isBusy || deactivatingId === Number(cand.candidateId)}
                          onClick={() => handleDeactivate(Number(cand.candidateId))}
                        >
                          <UserX className="h-4 w-4 mr-1 text-red-400" />
                          {deactivatingId === Number(cand.candidateId) ? "Deactivating…" : "Deactivate"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

            )}
          </Card>
        </div>
      ) : (
        <EmptyState
          icon={<UserCheck className="h-8 w-8" />}
          title="Select an election"
          description="Choose an election above to view its registered candidates or enroll new candidates on-chain."
        />
      )}
    </div>
  );
}
