import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "danger";

const VARIANT_STYLES: Record<AlertVariant, string> = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  danger: "border-red-500/40 bg-red-500/10 text-red-200",
};

const ICONS: Record<AlertVariant, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
}

/** Inline status/error surface with an icon, title and body. */
export function Alert({
  variant = "info",
  title,
  className,
  children,
  ...props
}: AlertProps) {
  const Icon = ICONS[variant];
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-xs opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
