import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-950 text-white shadow-xs",
        brand:
          "border-transparent bg-brand-lime text-slate-950 font-extrabold",
        secondary:
          "border-slate-200 bg-slate-100 text-slate-900",
        destructive:
          "border-rose-200 bg-rose-100 text-rose-900",
        outline: "border-slate-200 text-slate-700",
        success:
          "border-emerald-200 bg-emerald-100 text-emerald-900",
        warning:
          "border-amber-200 bg-amber-100 text-amber-900",
        info:
          "border-blue-200 bg-blue-100 text-blue-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
