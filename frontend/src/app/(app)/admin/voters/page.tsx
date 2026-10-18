"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { RefreshCw, Search, UserCheck, UserMinus, UserPlus, UserX } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField, inputClassName } from "@/components/admin/form-field";
import { TransactionStatus } from "@/components/admin/transaction-status";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useVoterAdmin } from "@/hooks/useVoterAdmin";
import { useVoterList } from "@/hooks/useVoterList";
import { useVoterLookup } from "@/hooks/useVoterLookup";
import { validateVoterInput } from "@/lib/admin/validation";
import { formatTimestamp, shortenAddress, shortenHash } from "@/lib/formatting";

/**
 * Voter management (§11, §12).
 *
 * Registration, deactivation and reactivation are REAL transactions against the
 * deployed VoterRegistry. Deactivation is non-destructive — the on-chain record
 * persists and can be reactivated. Search reads the registry DIRECTLY and shows
 * the indexed record (tx hash) only as supplementary enrichment.
 */
export default function AdminVotersPage() {
  const admin = useAdminRoles();
  const tx = useVoterAdmin();
  const voterList = useVoterList();

  const [wallet, setWallet] = useState("");
  const [commitment, setCommitment] = useState("");
  const [touched, setTouched] = useState(false);

  const [lookupInput, setLookupInput] = useState("");
  const [lookupAddress, setLookupAddress] = useState<string | undefined>(undefined);

  const lookup = useVoterLookup(lookupAddress);

  const validation = useMemo(
    () => validateVoterInput({ wallet, credentialCommitment: commitment }),
    [wallet, commitment],
  );

  const canRegister = admin.roles.VOTER_REGISTRAR_ROLE;

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!validation.valid) return;
    const ok = await tx.registerVoter(
      wallet.trim() as Address,
      commitment.trim() || undefined,
    );
    if (ok) {
      setWallet("");
      setCommitment("");
      setTouched(false);
      voterList.refetch();
      if (lookupAddress && lookupAddress.toLowerCase() === wallet.trim().toLowerCase()) {
        lookup.refetch();
      }
    }
  };

  const handleDeactivate = async () => {
    if (!lookup.address) return;
    const ok = await tx.deactivateVoter(lookup.address);
    if (ok) {
      lookup.refetch();
      voterList.refetch();
    }
  };

  const handleReactivate = async () => {
    if (!lookup.address) return;
    const ok = await tx.reactivateVoter(lookup.address);
    if (ok) {
      lookup.refetch();
      voterList.refetch();
    }
  };


  const errorFor = (field: string) => (touched ? validation.errors[field] : undefined);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Voter Registrar"
        title="Voters"
        description="Enrol and manage voter credentials. Every write is a real VoterRegistry transaction; the on-chain registry is the single source of truth."
      />

      {!canRegister ? (
        <Alert variant="warning" title="Voter Registrar role required">
          Registering or deactivating a voter calls an `onlyRole(VOTER_REGISTRAR_ROLE)`
          function on the VoterRegistry. Your wallet must hold this role on-chain.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Registration */}
        <Card className="space-y-5" data-testid="voter-register-form">
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" aria-hidden />
            Register voter
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Only the credential <span className="font-medium">commitment</span> (a
            bytes32 hash) is stored on-chain — never the raw credential. Leave the
            commitment blank to register with a zero commitment.
          </p>

          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            <FormField
              label="Wallet address"
              htmlFor="vr-wallet"
              required
              error={errorFor("wallet")}
              hint="The EVM address of the voter to enrol."
            >
              <input
                id="vr-wallet"
                data-testid="vr-wallet"
                className={inputClassName}
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
            </FormField>

            <FormField
              label="Credential commitment"
              htmlFor="vr-commitment"
              error={errorFor("credentialCommitment")}
              hint="Optional. 32-byte hex (0x + 64 characters)."
            >
              <input
                id="vr-commitment"
                data-testid="vr-commitment"
                className={inputClassName}
                value={commitment}
                onChange={(e) => setCommitment(e.target.value)}
                placeholder="0x… (optional)"
                spellCheck={false}
              />
            </FormField>

            <Button
              type="submit"
              disabled={!canRegister || tx.isBusy || (touched && !validation.valid)}
              data-testid="register-voter-submit"
            >
              <UserPlus className="h-4 w-4" />
              {tx.isBusy ? "Submitting…" : "Register voter"}
            </Button>
          </form>

          <TransactionStatus
            status={tx.status}
            txHash={tx.txHash}
            receipt={tx.receipt}
            error={tx.error}
          />
        </Card>

        {/* Lookup + management */}
        <Card className="space-y-5" data-testid="voter-lookup">
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" aria-hidden />
            Voter lookup
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Search the registry by wallet address. Status is read directly from the
            chain; the indexer record is shown only for comparison.
          </p>

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setLookupAddress(lookupInput.trim() || undefined);
            }}
          >
            <FormField label="Wallet address" htmlFor="vl-wallet" className="flex-1">
              <input
                id="vl-wallet"
                data-testid="vl-wallet"
                className={inputClassName}
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
            </FormField>
            <Button type="submit" variant="outline" data-testid="voter-lookup-submit">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </form>

          {lookupAddress ? (
            lookup.isLoading ? (
              <Skeleton className="h-24" />
            ) : lookup.error ? (
              <Alert variant="warning" title="Lookup failed">
                {lookup.error.message}
              </Alert>
            ) : (
              <div className="space-y-4" data-testid="voter-lookup-result">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{shortenAddress(lookup.address)}</span>
                  <Badge variant={lookup.registered ? "success" : "muted"}>
                    {lookup.registered ? "Registered" : "Not registered"}
                  </Badge>
                  {lookup.registered ? (
                    <Badge variant={lookup.active ? "success" : "warning"}>
                      {lookup.active ? "Active" : "Inactive"}
                    </Badge>
                  ) : null}
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Registered at
                    </dt>
                    <dd>{formatTimestamp(lookup.registeredAt ?? null)}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Commitment
                    </dt>
                    <dd className="font-mono text-xs">
                      {lookup.credentialCommitment
                        ? shortenHash(lookup.credentialCommitment, 12)
                        : "—"}
                    </dd>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                      Indexer tx
                    </dt>
                    <dd className="font-mono text-xs">
                      {lookup.indexed?.registered_tx_hash
                        ? shortenHash(lookup.indexed.registered_tx_hash)
                        : "—"}
                    </dd>
                  </div>
                </dl>

                {lookup.hasMismatch ? (
                  <Alert
                    variant="warning"
                    title="DATA CONSISTENCY WARNING"
                    data-testid="voter-mismatch"
                  >
                    The indexer reports this voter as{" "}
                    {lookup.indexed?.active ? "active" : "inactive"} while the chain
                    reports {lookup.active ? "active" : "inactive"}. The blockchain is
                    authoritative.
                  </Alert>
                ) : null}

                {lookup.registered ? (
                  <div className="flex flex-wrap gap-2">
                    {lookup.active ? (
                      <Button
                        variant="outline"
                        disabled={!canRegister || tx.isBusy}
                        onClick={handleDeactivate}
                        data-testid="deactivate-voter"
                      >
                        <UserX className="h-4 w-4" />
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={!canRegister || tx.isBusy}
                        onClick={handleReactivate}
                        data-testid="reactivate-voter"
                      >
                        <UserCheck className="h-4 w-4" />
                        Reactivate
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This wallet has no on-chain registration. Use the form to enrol it.
                  </p>
                )}
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Enter a wallet address and search to inspect its registration.
            </p>
          )}

          <TransactionStatus
            status={tx.status}
            txHash={tx.txHash}
            receipt={tx.receipt}
            error={tx.error}
          />

          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <UserMinus className="h-3 w-3" />
            Deactivation never deletes an on-chain record — it can be reactivated.
          </p>
        </Card>
      </div>

      {/* Registered Voters Roster */}
      <Card className="space-y-4" data-testid="voters-roster">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" aria-hidden />
              Registered Voters Roster ({voterList.total})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              OFF-CHAIN INDEXED VIEW: synchronized from on-chain VoterRegistered / VoterDeactivated events.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => voterList.refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh List
          </Button>
        </div>

        {voterList.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : voterList.voters.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No registered voters found in the read model.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3">Wallet Address</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Enrolled At</th>
                  <th className="py-2.5 px-3">Registration Tx</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono text-xs">
                {voterList.voters.map((v) => (
                  <tr key={v.wallet_address} className="hover:bg-muted/30">
                    <td className="py-2.5 px-3 font-semibold text-foreground">
                      {v.wallet_address}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <Badge variant={v.active ? "success" : "muted"}>
                        {v.active ? "Active" : "Deactivated"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground font-sans">
                      {formatTimestamp(v.registered_at)}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {v.registered_tx_hash ? shortenHash(v.registered_tx_hash) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setLookupInput(v.wallet_address);
                          setLookupAddress(v.wallet_address);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

