'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  readScopingFile,
  reparse,
  ScopingFileError,
  type ReadScopingFileResult,
} from '@/lib/scoping-sheet-file';
import { countQuestions } from '@/lib/scoping-sheet';
import { ScopingSheetBody } from './ScopingSheetBody';

/**
 * Choosing a questionnaire file, checking what was read out of it, and saving.
 *
 * Two steps, not four. There are exactly two roles to fill and, once the
 * trailing empty columns are trimmed, usually two candidate columns — a
 * numbered mapping wizard for that is ceremony. But a blind auto-detect with no
 * way out is how somebody ends up with an empty sheet and no idea why, so the
 * detected columns are shown on the review step with a way to change them.
 */
export function ScopingSheetUpload({
  existing,
  isSaving,
  onSave,
  onCancel,
}: {
  /** What is already attached, so replacing it can say what it displaces. */
  existing: { fileName: string; questionCount: number } | null;
  isSaving: boolean;
  onSave: (input: {
    fileName: string;
    sourceFormat: 'csv' | 'xlsx';
    sheetName: string | null;
    encoding: string | null;
    rows: ReadScopingFileResult['rows'];
  }) => void;
  onCancel: () => void;
}) {
  const [parsed, setParsed] = useState<ReadScopingFileResult | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function take(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      const result = await readScopingFile(file);
      setParsed(result);
      setShowColumns(result.columns === null || result.guessed);
      if (result.columns === null) {
        toast.info('Could not tell which columns are which', {
          description: 'Pick the question and answer columns below.',
        });
      }
    } catch (error) {
      // The whole error path — there are no error boundaries anywhere in this
      // app, so an unreported failure here is a dead dialog.
      if (error instanceof ScopingFileError) {
        toast.error(error.message, { description: error.hint });
      } else {
        toast.error('Could not read that file', {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    } finally {
      setReading(false);
    }
  }

  function setColumn(which: 'question' | 'answer', index: number) {
    if (!parsed) return;
    const current = parsed.columns ?? { question: 0, answer: 1 };
    setParsed(reparse(parsed, { ...current, [which]: index }));
  }

  function save() {
    if (!parsed) return;
    onSave({
      fileName: parsed.fileName,
      sourceFormat: parsed.sourceFormat,
      sheetName: parsed.sheetName,
      encoding: parsed.encoding,
      rows: parsed.rows,
    });
  }

  /* ---------------------------------------------------------- step 1 */

  if (!parsed) {
    return (
      <div className="px-6 py-5">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void take(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={
            dragging
              ? 'flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/60 px-6 py-12 text-center'
              : 'flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-200 px-6 py-12 text-center hover:border-slate-300 hover:bg-slate-50/60'
          }
        >
          <Upload className="mb-2 h-5 w-5 text-slate-300" />
          <p className="text-[12px] font-medium text-slate-700">
            {reading ? 'Reading…' : 'Drop the questionnaire here, or choose a file'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            CSV or Excel, as the client sent it. Nothing is uploaded — the file is read in your
            browser and only the questions and answers are saved.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              void take(e.target.files?.[0]);
              // Cleared so picking the same file twice still fires a change.
              e.target.value = '';
            }}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------- step 2 */

  const questions = countQuestions(parsed.rows);
  const canSave = questions > 0 && !isSaving;

  return (
    <>
      <div className="px-6 py-5">
        <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-slate-50/80 px-3.5 py-3">
          <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-slate-800">{parsed.fileName}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {questions} {questions === 1 ? 'question' : 'questions'}
              {parsed.sections.length > 0 &&
                ` across ${parsed.sections.length} ${parsed.sections.length === 1 ? 'section' : 'sections'}`}
              {parsed.unanswered > 0 && ` · ${parsed.unanswered} left unanswered`}
              {parsed.dropped > 0 && ` · ${parsed.dropped} blank rows ignored`}
              {parsed.sheetName && ` · sheet “${parsed.sheetName}”`}
            </p>
            {/* Surfaced because it is the one thing that was inferred rather
                than read. If it guessed wrong, the quotes and dashes below are
                where it shows. */}
            {parsed.encoding === 'windows-1252' && (
              <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                Read as Windows-1252 — this file carries no encoding marker. Worth a glance at the
                quotes and dashes below to check they look right.
              </p>
            )}
            {parsed.truncated && (
              <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                Only the first {parsed.rows.length} rows were kept. That is the ceiling for one
                questionnaire.
              </p>
            )}
          </div>
        </div>

        {/* ---- columns ---- */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              {parsed.columns
                ? <>Reading questions from column{' '}
                    <span className="font-medium text-slate-700">
                      {parsed.usedColumns[parsed.columns.question]?.label}
                    </span>{' '}
                    and answers from{' '}
                    <span className="font-medium text-slate-700">
                      {parsed.usedColumns[parsed.columns.answer]?.label}
                    </span>
                    {parsed.guessed && ' — worked out from the shape, not from a header'}
                  </>
                : 'Could not tell which columns hold the questions and the answers.'}
            </p>
            {parsed.usedColumns.length > 1 && (
              <button
                type="button"
                onClick={() => setShowColumns(!showColumns)}
                className="flex-shrink-0 text-[11px] text-blue-600 underline-offset-2 hover:underline"
              >
                {showColumns ? 'hide' : 'change'}
              </button>
            )}
          </div>

          {showColumns && parsed.usedColumns.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-3">
              {(['question', 'answer'] as const).map((which) => (
                <label key={which} className="text-[11px] text-slate-500">
                  <span className="mb-1 block capitalize">{which} column</span>
                  <select
                    value={parsed.columns?.[which] ?? ''}
                    onChange={(e) => setColumn(which, Number(e.target.value))}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
                  >
                    {parsed.usedColumns.map((column) => (
                      <option key={column.index} value={column.index}>
                        {column.label} — {column.sample.slice(0, 32) || 'empty'}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ---- the parse, drawn by the component that will draw it later ---- */}
        <div className="max-h-[380px] overflow-y-auto rounded-lg border border-slate-100 p-3">
          <ScopingSheetBody rows={parsed.rows} />
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setParsed(null)} disabled={isSaving}>
            Choose another
          </Button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={() => (existing ? setConfirmReplace(true) : save())}
          >
            {isSaving ? 'Saving…' : existing ? 'Replace' : 'Save to this estimate'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="Replace the questionnaire on this estimate?"
        description={
          existing
            ? `${parsed.fileName} (${questions} questions) takes the place of ${existing.fileName} (${existing.questionCount}). The old one is not kept — you would need the original file to put it back. No figure changes either way.`
            : undefined
        }
        confirmLabel="Replace"
        loading={isSaving}
        onConfirm={() => {
          setConfirmReplace(false);
          save();
        }}
      />
    </>
  );
}
