'use client';

import { Fragment, type ReactNode } from 'react';

export interface ScopingSheetRow {
  section: string | null;
  question: string;
  answer: string | null;
  isSectionHeader: boolean;
}

/**
 * Wraps every case-insensitive occurrence of `needle` in a mark.
 *
 * Split rather than replace, so the client's text stays a React text node and
 * is escaped like any other. Nothing here reaches
 * `dangerouslySetInnerHTML` — this is content somebody else wrote and emailed
 * us, and it renders inside a financial record.
 */
function highlight(text: string, needle: string): ReactNode {
  if (needle === '') return text;
  const parts: ReactNode[] = [];
  const haystack = text.toLowerCase();
  let cursor = 0;

  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark key={at} className="rounded-[2px] bg-amber-100 text-slate-900">
        {text.slice(at, at + needle.length)}
      </mark>
    );
    cursor = at + needle.length;
  }

  if (parts.length === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}

/** How many questions match a query, for the count beside the search box. */
export function countMatches(rows: ScopingSheetRow[], query: string): number {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      !row.isSectionHeader &&
      (needle === '' ||
        row.question.toLowerCase().includes(needle) ||
        (row.answer ?? '').toLowerCase().includes(needle))
  ).length;
}

/**
 * The stored questionnaire, grouped under the headings the client's own file
 * used.
 *
 * Shared by the builder section and the upload preview on purpose: what you
 * approve in the slide-over is drawn by the component that will draw it
 * afterwards, so a preview cannot flatter a parse that went wrong.
 *
 * Answers are shown whole. They were clamped to three lines once, which put a
 * click in front of the four thousand-character answers in a real sheet — which
 * are exactly the ones worth reading. The height is bounded by the scrolling
 * container this sits in instead, so the length of one answer costs nothing.
 *
 * Holds no state, and should not acquire any: it is a pure function of its two
 * props, which is what lets the early return below sit where it does.
 */
export function ScopingSheetBody({
  rows,
  query = '',
}: {
  rows: ScopingSheetRow[];
  query?: string;
}) {
  const needle = query.trim().toLowerCase();

  // Headings are structure, not content: they render as the group label below,
  // so carrying them as entries too would show every one twice.
  const matched = rows
    .map((row, index) => ({ ...row, index }))
    .filter((row) => !row.isSectionHeader)
    .filter(
      (row) =>
        needle === '' ||
        row.question.toLowerCase().includes(needle) ||
        (row.answer ?? '').toLowerCase().includes(needle)
    );

  if (matched.length === 0) {
    return (
      <p className="py-6 text-center text-[11px] text-slate-400">
        {needle === ''
          ? 'This sheet has headings but no questions under them.'
          : `Nothing in the questionnaire mentions “${query.trim()}”.`}
      </p>
    );
  }

  // Grouped in file order, never alphabetically — the client's own ordering is
  // itself information about how they think about their estate.
  const groups: { section: string | null; items: typeof matched }[] = [];
  for (const row of matched) {
    const last = groups[groups.length - 1];
    if (last && last.section === row.section) last.items.push(row);
    else groups.push({ section: row.section, items: [row] });
  }

  return (
    <div className="space-y-4">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex}>
          {group.section && (
            /* Pinned while the list scrolls, so the heading you are reading
               under stays on screen through ten sections. Opaque background,
               or the answers slide underneath it. */
            <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-white/95 px-1 py-1.5 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                {group.section}
              </p>
              <span className="text-[10px] tabular-nums text-slate-300">
                {group.items.length}
              </span>
              <span className="h-px flex-1 bg-slate-100" />
            </div>
          )}

          <div className="space-y-3">
            {group.items.map((row) => {
              const answer = row.answer ?? '';
              return (
                <div key={row.index}>
                  <p className="mb-1 text-[12px] font-medium leading-relaxed text-slate-700">
                    {highlight(row.question, needle)}
                  </p>
                  {answer === '' ? (
                    /* A filled block with nothing in it reads as a rendering
                       fault. An outline reads as an absence — which is what
                       this is, and it is worth seeing before committing hours
                       to the question. */
                    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-1.5 text-[11px] italic text-slate-400">
                      Not answered
                    </p>
                  ) : (
                    /* whitespace-pre-wrap because the numbering and indentation
                       inside these answers is structure the client wrote.
                       Flattened, a five-item list reads as one run-on sentence.
                       break-words so one long unbroken token cannot widen the
                       panel and force the page sideways. */
                    <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50/80 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                      {highlight(answer, needle)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
