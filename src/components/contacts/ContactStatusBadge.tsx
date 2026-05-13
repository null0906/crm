import React from 'react';

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; dot: string; label: string }> = {
  new: {
    label: 'New',
    bg: 'var(--color-status-new-bg)',
    border: 'var(--color-status-new-border)',
    text: 'var(--color-status-new-text)',
    dot: 'var(--color-status-new-dot)',
  },
  contacted: {
    label: 'Contacted',
    bg: 'var(--color-status-contacted-bg)',
    border: 'var(--color-status-contacted-border)',
    text: 'var(--color-status-contacted-text)',
    dot: 'var(--color-status-contacted-dot)',
  },
  qualified: {
    label: 'Qualified',
    bg: 'var(--color-status-qualified-bg)',
    border: 'var(--color-status-qualified-border)',
    text: 'var(--color-status-qualified-text)',
    dot: 'var(--color-status-qualified-dot)',
  },
  unqualified: {
    label: 'Unqualified',
    bg: 'var(--color-status-unqualified-bg)',
    border: 'var(--color-status-unqualified-border)',
    text: 'var(--color-status-unqualified-text)',
    dot: 'var(--color-status-unqualified-dot)',
  },
  nurturing: {
    label: 'Nurturing',
    bg: 'var(--color-status-nurturing-bg)',
    border: 'var(--color-status-nurturing-border)',
    text: 'var(--color-status-nurturing-text)',
    dot: 'var(--color-status-nurturing-dot)',
  },
  converted: {
    label: 'Converted',
    bg: 'var(--color-status-qualified-bg)',
    border: 'var(--color-status-qualified-border)',
    text: 'var(--color-status-qualified-text)',
    dot: 'var(--color-status-qualified-dot)',
  },
  lost: {
    label: 'Lost',
    bg: 'var(--color-status-unqualified-bg)',
    border: 'var(--color-status-unqualified-border)',
    text: 'var(--color-status-unqualified-text)',
    dot: 'var(--color-status-unqualified-dot)',
  },
  archived: {
    label: 'Archived',
    bg: 'var(--color-neutral-bg)',
    border: 'var(--color-border)',
    text: 'var(--color-neutral)',
    dot: 'var(--color-border-strong)',
  },
};

export function ContactStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new!;

  return (
    <span
      style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.text }}
      className="status-badge inline-flex items-center gap-[5px] rounded-[5px] border px-2 py-[3px] text-[11.5px] font-semibold tracking-[0.01em] whitespace-nowrap"
    >
      <span
        style={{ background: cfg.dot }}
        className="h-[5px] w-[5px] flex-shrink-0 rounded-full"
      />
      {cfg.label}
    </span>
  );
}
