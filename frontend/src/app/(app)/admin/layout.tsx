import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin";

/** Layout for every /admin route: access gate + console chrome. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
