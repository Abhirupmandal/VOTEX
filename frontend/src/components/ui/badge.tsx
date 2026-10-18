import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/40 bg-primary/15 text-primary",
        outline: "border-border bg-transparent text-foreground",
        muted: "border-border/60 bg-card/60 text-muted-foreground",
        success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
        warning: "border-amber-500/40 bg-amber-500/15 text-amber-400",
        danger: "border-red-500/40 bg-red-500/15 text-red-400",
        info: "border-sky-500/40 bg-sky-500/15 text-sky-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
