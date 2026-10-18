"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormField, inputClassName, textareaClassName } from "@/components/admin/form-field";
import { TransactionStatus } from "@/components/admin/transaction-status";
import { useCreateElection } from "@/hooks/useElectionAdmin";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useChainTime } from "@/hooks/useChainTime";
import {
  dateTimeLocalToUnix,
  unixToDateTimeLocal,
  validateElectionDraft,
} from "@/lib/admin/validation";
import { ROLES } from "@/lib/admin/roles";

interface DraftState {
  title: string;
  description: string;
  registrationStart: string;
  registrationEnd: string;
  votingStart: string;
  votingEnd: string;
}

/** Sensible default windows: registration opens now, voting the following day. */
function defaultDraft(nowSeconds: number): DraftState {
  const now = nowSeconds;
  const day = 86_400;
  return {
    title: "",
    description: "",
    registrationStart: unixToDateTimeLocal(now + 300),
    registrationEnd: unixToDateTimeLocal(now + day),
    votingStart: unixToDateTimeLocal(now + day + 300),
    votingEnd: unixToDateTimeLocal(now + 2 * day),
  };
}

export function CreateElectionForm({ onCreated }: { onCreated?: () => void }) {
  const admin = useAdminRoles();
  const tx = useCreateElection();
  const chain = useChainTime();
  const [draft, setDraft] = useState<DraftState>(() => defaultDraft(chain.nowSeconds));
  const [touched, setTouched] = useState(false);

  // Re-seed the default windows the first time the chain clock resolves, so a
  // drifted chain clock never leaves the pre-filled draft in the past.
  useEffect(() => {
    if (chain.isAuthoritative) {
      setDraft((prev) =>
        prev.title === "" && prev.description === ""
          ? defaultDraft(chain.nowSeconds)
          : prev,
      );
    }
  }, [chain.isAuthoritative, chain.nowSeconds]);

  const parsed = useMemo(
    () => ({
      title: draft.title,
      description: draft.description,
      registrationStart: dateTimeLocalToUnix(draft.registrationStart),
      registrationEnd: dateTimeLocalToUnix(draft.registrationEnd),
      votingStart: dateTimeLocalToUnix(draft.votingStart),
      votingEnd: dateTimeLocalToUnix(draft.votingEnd),
    }),
    [draft],
  );

  // Validation runs against the CHAIN clock, never the wall clock: the factory
  // itself enforces `registrationStart >= block.timestamp` (§6).
  const validation = useMemo(
    () => validateElectionDraft(parsed, chain.nowSeconds),
    [parsed, chain.nowSeconds],
  );

  const canManage = admin.roles.ELECTION_MANAGER_ROLE;

  const set = (key: keyof DraftState) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!validation.valid) return;
    if (
      parsed.registrationStart === null ||
      parsed.registrationEnd === null ||
      parsed.votingStart === null ||
      parsed.votingEnd === null
    ) {
      return;
    }
    const ok = await tx.createElection({
      title: parsed.title.trim(),
      description: parsed.description.trim(),
      registrationStart: parsed.registrationStart,
      registrationEnd: parsed.registrationEnd,
      votingStart: parsed.votingStart,
      votingEnd: parsed.votingEnd,
    });
    if (ok) {
      setDraft(defaultDraft(chain.nowSeconds));
      setTouched(false);
      onCreated?.();
    }
  };

  const errorFor = (field: string) =>
    touched ? validation.errors[field] : undefined;

  return (
    <Card className="space-y-5" data-testid="create-election-form">
      <CardTitle>Create election</CardTitle>

      {!canManage ? (
        <Alert variant="warning" title="Election Manager role required">
          Creating an election calls an `onlyRole(ELECTION_MANAGER_ROLE)` function.
          Your wallet must hold {ROLES.ELECTION_MANAGER_ROLE.label} on-chain.
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField label="Title" htmlFor="ce-title" error={errorFor("title")} required>
          <input
            id="ce-title"
            data-testid="ce-title"
            className={inputClassName}
            value={draft.title}
            onChange={(e) => set("title")(e.target.value)}
            placeholder="e.g. Student Council Election 2026"
            maxLength={140}
          />
        </FormField>

        <FormField
          label="Description"
          htmlFor="ce-description"
          error={errorFor("description")}
          hint="Optional context shown on the election page."
        >
          <textarea
            id="ce-description"
            data-testid="ce-description"
            className={textareaClassName}
            value={draft.description}
            onChange={(e) => set("description")(e.target.value)}
            placeholder="Purpose, eligibility, and rules…"
            maxLength={2000}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Registration opens"
            htmlFor="ce-rs"
            error={errorFor("registrationStart")}
            required
          >
            <input
              id="ce-rs"
              data-testid="ce-rs"
              type="datetime-local"
              className={inputClassName}
              value={draft.registrationStart}
              onChange={(e) => set("registrationStart")(e.target.value)}
            />
          </FormField>
          <FormField
            label="Registration closes"
            htmlFor="ce-re"
            error={errorFor("registrationEnd")}
            required
          >
            <input
              id="ce-re"
              data-testid="ce-re"
              type="datetime-local"
              className={inputClassName}
              value={draft.registrationEnd}
              onChange={(e) => set("registrationEnd")(e.target.value)}
            />
          </FormField>
          <FormField
            label="Voting opens"
            htmlFor="ce-vs"
            error={errorFor("votingStart")}
            required
          >
            <input
              id="ce-vs"
              data-testid="ce-vs"
              type="datetime-local"
              className={inputClassName}
              value={draft.votingStart}
              onChange={(e) => set("votingStart")(e.target.value)}
            />
          </FormField>
          <FormField
            label="Voting closes"
            htmlFor="ce-ve"
            error={errorFor("votingEnd")}
            required
          >
            <input
              id="ce-ve"
              data-testid="ce-ve"
              type="datetime-local"
              className={inputClassName}
              value={draft.votingEnd}
              onChange={(e) => set("votingEnd")(e.target.value)}
            />
          </FormField>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={!canManage || tx.isBusy || (touched && !validation.valid)}
            data-testid="create-election-submit"
          >
            {tx.isBusy ? "Submitting…" : "Create election"}
          </Button>
          <p className="text-xs text-muted-foreground">
            A real transaction is sent to the ElectionFactory. The new election
            starts in the DRAFT state.
          </p>
        </div>
      </form>

      <TransactionStatus
        status={tx.status}
        txHash={tx.txHash}
        receipt={tx.receipt}
        error={tx.error}
      />
    </Card>
  );
}
