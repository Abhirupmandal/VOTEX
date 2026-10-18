"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PlusCircle } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { CreateElectionForm } from "@/components/admin/create-election-form";

export default function CreateElectionPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 w-fit">
          <Link href="/admin/elections">
            <ArrowLeft className="h-4 w-4" />
            Back to elections
          </Link>
        </Button>
        <PageHeader
          eyebrow="Election Manager"
          title="Create New Election"
          description="Deploy an isolated ElectionInstance contract via the authoritative ElectionFactory. Validates non-overlapping registration and voting bounds before submission."
        />
      </div>

      <CreateElectionForm
        onCreated={() => {
          // Delay briefly to allow indexer to ingest event, then navigate back
          setTimeout(() => {
            router.push("/admin/elections");
          }, 3500);
        }}
      />
    </div>
  );
}
