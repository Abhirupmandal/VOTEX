import { Badge } from "@/components/ui/badge";
import { ROLES, roleByHash, type RoleKey } from "@/lib/admin/roles";
import { cn } from "@/lib/utils";

export interface RoleBadgeProps {
  /** Either a canonical role key or a raw on-chain bytes32 hash. */
  role: RoleKey | string;
  /** Render greyed-out when the role is NOT held. */
  granted?: boolean;
  className?: string;
}

const ROLE_TONE: Record<RoleKey, "default" | "info" | "warning" | "success" | "muted"> = {
  DEFAULT_ADMIN_ROLE: "default",
  ELECTION_MANAGER_ROLE: "info",
  VOTER_REGISTRAR_ROLE: "success",
  SECURITY_OFFICER_ROLE: "warning",
  AUDITOR_ROLE: "muted",
};

/** Compact badge for an administrative role, on-chain hash aware. */
export function RoleBadge({ role, granted = true, className }: RoleBadgeProps) {
  const definition =
    role in ROLES ? ROLES[role as RoleKey] : roleByHash(role);

  const label = definition?.label ?? "Unknown role";
  const tone = definition ? ROLE_TONE[definition.key] : "muted";

  return (
    <Badge
      variant={granted ? tone : "muted"}
      className={cn(granted ? undefined : "opacity-50", className)}
      data-testid={`role-badge-${(definition?.key ?? role).toLowerCase()}`}
    >
      {label}
      {granted ? null : " · not held"}
    </Badge>
  );
}
