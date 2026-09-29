'use client';

import { useMemo, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { formatDateTime } from '@/lib/formatters';
import { countMatches, ScopingSheetBody } from './ScopingSheetBody';
import { ScopingSheetUpload } from './ScopingSheetUpload';

/**
 * What the client actually told us, sitting where the hours get decided.
 *
 * Distinct from `ScopingQuestionnaire` above it, which asks this business's own
 * sizing drivers and produces the multiplier. This is the client's returned
 * sheet: their prose, their words, their order. It drives nothing. It is here
 * because the next thing anyone does after reading it is decide hours and
 * headcount in the editor directly below.
 *
 * Owns its query, its mutations and its dialogs, and takes only two props. That
 * is not incidental — see the note on EstimateBuilder about hook counts. It
 * also keeps a few hundred kilobytes of prose out of `getById`, which the
 * builder refetches on every autosave across every panel.
 *
 * Not unit-tested: vitest is configured for `src/**\/*.test.ts` and does not
 * collect `.tsx`, and the judgement worth testing all lives in
 * `src/lib/scoping-sheet.ts`, which is covered. This renders text.
 */
export function ClientScopingSheet({
  estimateId,
  readOnly,
}: {
  estimateId: string;
  readOnly: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: sheet, isLoading } = trpc.estimates.getScopingSheet.useQuery({ estimateId });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = () => utils.estimates.getScopingSheet.invalidate({ estimateId });

  // Unlike the panels that save themselves, this does toast on success. Those
  // are silent because they fire every two seconds; this is a deliberate,
  // one-shot, button-pressed write — the same class as approving.
  const upload = trpc.estimates.uploadScopingSheet.useMutation({
    onSuccess: (result) => {
      toast.success(result.replaced ? 'Questionnaire replaced' : 'Questionnaire saved', {
        description: `${result.rowCount} rows stored. Nothing about the cost has changed.`,
      });
      void refresh();
      setUploadOpen(false);
    },
    onError: (err) => toast.error('Could not save the questionnaire', { description: err.message }),
  });

  const remove = trpc.estimates.deleteScopingSheet.useMutation({
    onSuccess: () => {
      toast.success('Questionnaire removed');
      void refresh();
      setConfirmDelete(false);
    },
    onError: (err) =>
      toast.error('Could not remove the questionnaire', { description: err.message }),
  });

  const rows = useMemo(() => sheet?.answers ?? [], [sheet]);

  const summary = useMemo(() => {
    const questions = rows.filter((r) => !r.isSectionHeader);
    return {
      questions: questions.length,
      sections: new Set(questions.map((r) => r.section).filter(Boolean)).size,
      // Surfaced because an unanswered scoping question is a risk, not a
      // formatting detail — it is scope nobody has pinned down yet.
      unanswered: questions.filter((r) => !r.answer).length,
    };
  }, [rows]);

  const matches = countMatches(rows, query);

  // Every hook is above this line and none may be added below it — the same
  // rule, and the same bug, as the note on EstimateBuilder. A frozen estimate
  // that never received a questionnaire never will, so the section is dropped
  // rather than shown permanently empty on a record that cannot take one.
  if (readOnly && !isLoading && !sheet) return null;

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-medium text-slate-800">What the client told us</h2>
            {summary.questions > 0 && <Badge variant="secondary">{summary.questions}</Badge>}
            {summary.unanswered > 0 && (
              <Badge variant="warning">{summary.unanswered} unanswered</Badge>
            )}
          </div>
          {sheet ? (
            <>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {sheet.document.fileName}
                {summary.sections > 0 && (
                  <span className="text-slate-400">
                    {' · '}
                    {summary.questions} {summary.questions === 1 ? 'question' : 'questions'} across{' '}
                    {summary.sections} {summary.sections === 1 ? 'section' : 'sections'}
                  </span>
                )}
              </p>
              {/* The sentence that stops anyone assuming this panel is what
                  priced the engagement. */}
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                Uploaded {formatDateTime(sheet.document.uploadedAt)}. Reference only — it drives no
                multiplier and moves nobody.
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              The scoping questionnaire the client filled in and sent back. Reference only — it
              drives no multiplier and moves nobody.
            </p>
          )}
        </div>

        {!readOnly && (
          <div className="flex flex-shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-1 h-3 w-3" />
              {sheet ? 'Replace' : 'Upload'}
            </Button>
            {sheet && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-1 text-slate-300 hover:text-red-500"
                title="Remove the questionnaire from this estimate"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading && <p className="text-[11px] text-slate-400">Loading…</p>}

      {!isLoading && !sheet && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          Nothing uploaded. If the client sent their scoping answers back as a spreadsheet, put it
          here so it sits beside the hours instead of in an inbox.
        </p>
      )}

      {sheet && (
        <>
          {/* Open, always. This panel exists to be read while the hours below
              are decided, and a collapsed one puts a click in front of the one
              thing you came to the page for. */}
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the questions and answers…"
              className="h-8"
            />
            {/* Without this, finding two results and not noticing the other
                twenty-seven are filtered out is a very easy mistake. */}
            {query.trim() !== '' && (
              <span className="flex-shrink-0 text-[11px] tabular-nums text-slate-400">
                {matches} of {summary.questions}
              </span>
            )}
          </div>

          {/* Bounded rather than uncapped: twenty-nine questions with
              thousand-character answers would otherwise put the team editor,
              the cost breakdown and the price several screens down the page.
              Short sheets never reach this height and show no scrollbar. */}
          <div className="mt-3 max-h-[600px] overflow-y-auto pr-1">
            <ScopingSheetBody rows={rows} query={query} />
          </div>
        </>
      )}

      <SlideOverPanel
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={sheet ? 'Replace the scoping questionnaire' : 'Upload the scoping questionnaire'}
        width="xl"
      >
        {/* Remounted each time it opens, so a parse abandoned last time is gone
            rather than waiting there. */}
        {uploadOpen && (
          <ScopingSheetUpload
            existing={
              sheet
                ? { fileName: sheet.document.fileName, questionCount: summary.questions }
                : null
            }
            isSaving={upload.isPending}
            onCancel={() => setUploadOpen(false)}
            onSave={(input) => upload.mutate({ id: estimateId, ...input })}
          />
        )}
      </SlideOverPanel>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title="Remove this questionnaire?"
        description={`${sheet?.document.fileName ?? 'The file'} is not kept anywhere else — you would need the original to put it back. Nothing about the cost changes either way.`}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => remove.mutate({ id: estimateId })}
      />
    </section>
  );
}
