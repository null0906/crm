import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // Base
        'flex h-8 w-full rounded-md px-3 py-1.5',
        // Typography
        'text-base text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)]',
        // Background — slightly recessed to distinguish from card surface
        'bg-[var(--color-bg)] border border-[var(--color-border)]',
        // Shadow — subtle inset depth
        'shadow-none',
        // Transitions
        'transition-all duration-150',
        // Focus — accent border + ring glow
        'focus-visible:bg-[var(--color-surface)]',
        'focus-visible:border-[var(--color-border-focus)]',
        // File input
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--color-text-2)]',
        // Disabled
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-surface-alt)]',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
