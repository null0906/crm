import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // Base
        'flex h-9 w-full rounded-lg px-3 py-1.5',
        // Typography
        'text-sm text-slate-900 placeholder:text-slate-400',
        // Background — slightly recessed to distinguish from card surface
        'bg-slate-50 border border-slate-200',
        // Shadow — subtle inset depth
        'shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
        // Transitions
        'transition-all duration-150',
        // Focus — accent border + ring glow
        'focus-visible:outline-none focus-visible:bg-white',
        'focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20',
        // File input
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-slate-700',
        // Disabled
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-100',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
