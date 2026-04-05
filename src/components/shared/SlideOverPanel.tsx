'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlideOverPanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

export function SlideOverPanel({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'lg',
}: SlideOverPanelProps) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'relative flex flex-col bg-white h-full overflow-hidden animate-slide-in-right',
          'shadow-[0_24px_64px_rgba(16,24,40,0.12),_0_8px_24px_rgba(16,24,40,0.06)]',
          'border-l border-slate-200',
          width === 'md' && 'w-full max-w-lg',
          width === 'lg' && 'w-full max-w-2xl',
          width === 'xl' && 'w-full max-w-4xl',
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-lg',
                'text-slate-400 hover:text-slate-700 hover:bg-slate-100',
                'transition-colors duration-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              )}
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 bg-slate-50/60">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
