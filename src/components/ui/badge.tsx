import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  // Base — muted/subtle style throughout (modern convention: tinted bg + matching dark text)
  'inline-flex items-center rounded-md border-0 px-2 py-0.5 text-xs font-medium transition-colors tracking-[-0.01em]',
  {
    variants: {
      variant: {
        // Primary — indigo tint
        default:     'bg-blue-100 text-blue-700',
        // Neutral — gray
        secondary:   'bg-slate-100 text-slate-600',
        // Danger — muted red
        destructive: 'bg-red-100 text-red-700',
        // Just border, no fill
        outline:     'border border-slate-200 bg-transparent text-slate-600',
        // Success — muted emerald
        success:     'bg-green-100 text-green-700',
        // Warning — warm amber
        warning:     'bg-amber-100 text-amber-700',
        // Info — soft sky
        info:        'bg-blue-100 text-blue-600',
        // Purple
        purple:      'bg-purple-100 text-purple-700',
        // Active / live
        active:      'bg-green-100 text-green-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
