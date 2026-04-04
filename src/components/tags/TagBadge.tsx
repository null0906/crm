'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagBadgeProps {
  name: string;
  color?: string;
  onRemove?: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function TagBadge({ name, color = '#6B7280', onRemove, className, size = 'sm' }: TagBadgeProps) {
  // Convert hex to light background
  const bg = color + '20';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1',
        className
      )}
      style={{ backgroundColor: bg, color, borderColor: color + '40', border: '1px solid' }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hover:opacity-70 flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
