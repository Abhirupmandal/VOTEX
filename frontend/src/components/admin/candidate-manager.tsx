"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { Plus, UserMinus } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormField, inputClassName, textareaClassName } from "@/components/admin/form-field";
import { TransactionStatus } from "@/components/admin/transaction-status";
import { useCandidateAdmin } from "@/hooks/useElectionAdmin";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { validateCandidateInput } from "@/lib/admin/validation";
import type { OnChainCandidate } from "@/types";

export interface CandidateManagerProps {
  electionId: number;
  electionAddress: Address | undefined;
  candidates: OnChainCandidate[];
  /** Candidates may only be added before voting begins. */
  stateName: string;
  onChanged?: () => void;
}

const ADDABLE_STATES = ["DRAFT", "REGISTRATION"];

/** Add / deactivate candidates on a deployed election instance (§8). */
export function CandidateManager({
  electionId,
  electionAddress,
  candidates,
  stateName,
  onChanged,
}: CandidateManagerProps) {
  const admin = useAdminRoles();
  const tx = useCandidateAdmin();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  const validation = useMemo(
    () => validateCandidateInput(name, description),
    [name, description],
  );

  const canManage = admin.roles.ELECTION_MANAGER_ROLE;
  const addable = ADDABLE_STATES.includes(stateName) && Boolean(electionAddress);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!validation.valid || !electionAddress) return;
    const ok = await tx.addCandidate(
      electionAddress,
      electionId,
      name.trim(),
      description.trim(),
    );
    if (ok) {
      setName("");
      setDescription("");
      setTouched(false);
      onChanged?.();
    }
  };

  const handleDeactivate = async (candidateId: number) => {
    if (!electionAddress) return;
    const ok = await tx.deactivateCandidate(electionAddress, electionId, candidateId);
    if (ok) onChanged?.();
  };

  return (
    <Card className="space-y-5" data-testid="candidate-manager">
      <CardTitle>Candidate management</CardTitle>

      {!canManage ? (
        <Alert variant="warning" title="Election Manager role required">
          Candidate writes are guarded by `onlyRole(ELECTION_MANAGER_ROLE)`.
        </Alert>
      ) : null}

      {!addable ? (
        <Alert variant="info" title="Candidates are locked">
          Candidates can only be added while the election is in DRAFT or
          REGISTRATION. Existing candidates can still be deactivated if the
          contract permits.
        </Alert>
      ) : null}

      <form onSubmit={handleAdd} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Name"
            htmlFor="cm-name"
            required
            error={touched ? validation.errors.name : undefined}
          >
            <input
              id="cm-name"
              data-testid="cm-name"
              className={inputClassName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Candidate name"
              maxLength={140}
            />
          </FormField>
          <FormField
            label="Description"
            htmlFor="cm-desc"
            error={touched ? validation.errors.description : undefined}
          >
            <input
              id="cm-desc"
              data-testid="cm-desc"
              className={inputClassName}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              maxLength={1000}
            />
          </FormField>
        </div>
        <Button
          type="submit"
          disabled={
            !canManage ||
            !addable ||
            tx.isBusy ||
            (touched && !validation.valid)
          }
          data-testid="add-candidate-submit"
        >
          <Plus className="h-4 w-4" />
          {tx.isBusy ? "Submitting…" : "Add candidate"}
        </Button>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          On-chain candidates ({candidates.length})
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No candidates have been added yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {candidates.map((candidate) => (
              <li
                key={candidate.candidateId.toString()}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{candidate.candidateId.toString()}
                  </span>
                  <span className="text-sm font-medium">{candidate.name}</span>
                  {candidate.description ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {candidate.description}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={candidate.active ? "success" : "muted"}>
                    {candidate.active ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canManage || !candidate.active || tx.isBusy || !electionAddress}
                    onClick={() => handleDeactivate(Number(candidate.candidateId))}
                    data-testid={`deactivate-candidate-${candidate.candidateId}`}
                  >
                    <UserMinus className="h-4 w-4" />
                    Deactivate
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TransactionStatus
        status={tx.status}
        txHash={tx.txHash}
        receipt={tx.receipt}
        error={tx.error}
      />
    </Card>
  );
}
