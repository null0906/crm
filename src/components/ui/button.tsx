import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md',
    'text-sm font-medium tracking-[-0.005em]',
    'transition-all duration-150 ease-out',
    'focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'btn-primary border-0 bg-linear-to-br from-[var(--color-accent)] to-[var(--color-accent-hover)] text-[var(--color-text-inverse)] font-semibold',
          'shadow-[0_1px_3px_rgba(37,99,235,0.30),_0_1px_2px_rgba(37,99,235,0.20)]',
          'hover:from-[var(--color-accent-hover)] hover:to-[var(--color-accent-deep)] hover:shadow-[0_4px_10px_rgba(37,99,235,0.35),_0_2px_4px_rgba(37,99,235,0.20)] hover:-translate-y-px',
          'active:translate-y-0 active:shadow-[0_1px_3px_rgba(37,99,235,0.20)]',
        ].join(' '),

        destructive: [
          'bg-[var(--color-danger)] text-[var(--color-text-inverse)]',
          'shadow-xs',
          'hover:brightness-95',
        ].join(' '),

        outline: [
          'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-1)]',
          'shadow-xs',
          'hover:bg-[var(--color-surface-alt)] hover:border-[var(--color-border-strong)]',
          'active:bg-[var(--color-surface-alt)]',
        ].join(' '),

        secondary: [
          'bg-[var(--color-surface-alt)] text-[var(--color-text-2)]',
          'hover:text-[var(--color-text-1)]',
        ].join(' '),

        ghost: [
          'text-[var(--color-text-2)]',
          'hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-1)]',
        ].join(' '),

        link: [
          'text-[var(--color-accent)] underline-offset-4',
          'hover:underline hover:text-[var(--color-accent-hover)]',
        ].join(' '),
      },

      size: {
        default: 'h-8 px-3 py-2',
        sm:      'h-[30px] px-2.5 text-sm rounded-md',
        lg:      'h-10 px-5',
        icon:    'h-8 w-8 p-0',
        'icon-sm': 'h-7 w-7 p-0 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
