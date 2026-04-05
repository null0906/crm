import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm',
        'text-slate-900 placeholder:text-slate-400',
        'transition-[border-color,box-shadow,background-color] duration-150',
        'focus-visible:outline-none focus-visible:bg-white focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-100',
        'resize-none',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
