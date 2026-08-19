'use client';

import React, { useState, useRef } from 'react';
import { Upload, AlertCircle, CheckCircle2, ArrowRight, RotateCcw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface BackfillDealLinksWizardProps {
  pipelineId: string;
  pipelineName: string;
  onClose: () => void;
}

// The same field set as the deals import so the user can upload the exact same CSV
const DEAL_FIELDS = [
  { value: 'title', label: 'Prospect Title *', mandatory: true },
  { value: 'contactName', label: 'Contact Name', mandatory: false },
  { value: 'companyName', label: 'Company Name', mandatory: false },
  { value: 'stageName', label: 'Stage Name', mandatory: false },
  { value: 'probability', label: 'Probability (%)', mandatory: false },
  { value: 'description', label: 'Notes', mandatory: false },
];

type Step = 'upload' | 'map' | 'preview' | 'done';

interface Result {
  linked: number;
  companiesCreated: number;
  contactsCreated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export function BackfillDealLinksWizard({ pipelineId, pipelineName, onClose }: BackfillDealLinksWizardProps) {
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const backfill = trpc.import.backfillDealLinks.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
      toast.success(`Re-link complete: ${data.linked} prospects updated`);
    },
    onError: (err) => toast.error('Re-link failed', { description: err.message }),
  });

  function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = (lines[0] ?? '').split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      return obj;
    });
    return { headers, rows };
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setRows(rows);
      // Auto-map: if header closely matches a field label or value
      const autoMap: Record<string, string> = {};
      for (const header of headers) {
        const lower = header.toLowerCase().replace(/[^a-z]/g, '');
        const match = DEAL_FIELDS.find((f) => {
          const fLower = f.value.toLowerCase().replace(/[^a-z]/g, '');
          const lLower = f.label.toLowerCase().replace(/[^a-z *]/g, '');
          return fLower === lower || lLower.startsWith(lower) || lower.startsWith(fLower);
        });
        if (match) autoMap[header] = match.value;
      }
      setColumnMap(autoMap);
      setStep('map');
    };
    reader.readAsText(file);
  }

  const titleMapped = Object.values(columnMap).includes('title');
  const hasContactOrCompany =
    Object.values(columnMap).includes('contactName') ||
    Object.values(columnMap).includes('companyName');

  return (
    <div className="flex flex-col h-full">
      {/* Step indicator */}
      <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {(['upload', 'map', 'preview', 'done'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <span className={`font-medium capitalize ${step === s ? 'text-blue-600' : step > s ? 'text-slate-400' : 'text-slate-400'}`}>
                {i + 1}. {s === 'map' ? 'Map Columns' : s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {i < 3 && <ArrowRight className="w-3 h-3 text-slate-300" />}
            </React.Fragment>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Pipeline: <span className="font-medium text-slate-600">{pipelineName}</span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* ── STEP 1: Upload ── */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Re-link contacts & companies from CSV</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Upload the same CSV you used to import your prospects. For each row, we'll find the prospect by title,
                create any missing companies or contacts, and link them — without creating duplicate prospects.
              </p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <strong>Note:</strong> Your CSV must have a <strong>Prospect Title</strong> column so we can match
              existing prospects. Rows where no matching prospect is found will be skipped.
            </div>

            <div
              className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
            >
              <Upload className="w-8 h-8 text-slate-400" />
              <p className="text-sm font-medium text-slate-600">Drop your CSV here or click to browse</p>
              <p className="text-xs text-slate-400">.csv files only</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          </div>
        )}

        {/* ── STEP 2: Map columns ── */}
        {step === 'map' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Map your CSV columns</h3>
              <p className="text-xs text-slate-500">{rows.length} rows detected. Match each CSV column to a prospect field.</p>
            </div>

            {!hasContactOrCompany && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Map at least one of <strong>Contact Name</strong> or <strong>Company Name</strong> to create and link records.</span>
              </div>
            )}

            <div className="space-y-2">
              {csvHeaders.map((header) => (
                <div key={header} className="flex items-center gap-3">
                  <div className="w-40 text-xs font-mono text-slate-600 truncate bg-slate-100 px-2 py-1.5 rounded border border-slate-200 flex-shrink-0">
                    {header}
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <select
                    value={columnMap[header] ?? ''}
                    onChange={(e) => setColumnMap((prev) => ({ ...prev, [header]: e.target.value }))}
                    className="flex-1 text-xs border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— Skip —</option>
                    {DEAL_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('upload')} className="flex-1">Back</Button>
              <Button
                onClick={() => setStep('preview')}
                disabled={!titleMapped || !hasContactOrCompany}
                className="flex-1"
              >
                Preview
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Preview ── */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Ready to re-link</h3>
              <p className="text-xs text-slate-500">
                We'll process <strong>{rows.length}</strong> rows. For each one:
              </p>
              <ul className="text-xs text-slate-500 mt-2 space-y-1 list-disc list-inside">
                <li>Find the existing prospect by title in <strong>{pipelineName}</strong></li>
                <li>Find or create the company (if Company Name is mapped)</li>
                <li>Find or create the contact (if Contact Name is mapped)</li>
                <li>Update the prospect's links — no duplicates</li>
              </ul>
            </div>

            {/* Preview table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Title</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Company</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 8).map((row, i) => {
                    const title = Object.entries(columnMap).find(([, v]) => v === 'title')?.[0];
                    const company = Object.entries(columnMap).find(([, v]) => v === 'companyName')?.[0];
                    const contact = Object.entries(columnMap).find(([, v]) => v === 'contactName')?.[0];
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-800 truncate max-w-[140px]">{title ? row[title] : '—'}</td>
                        <td className="px-3 py-2 text-slate-500 truncate max-w-[120px]">{company ? row[company] : '—'}</td>
                        <td className="px-3 py-2 text-slate-500 truncate max-w-[120px]">{contact ? row[contact] : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 8 && (
                <div className="px-3 py-2 text-[11px] text-slate-400 bg-slate-50 border-t border-slate-200">
                  +{rows.length - 8} more rows
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('map')} className="flex-1">Back</Button>
              <Button
                onClick={() => backfill.mutate({ rows, columnMap, pipelineId })}
                disabled={backfill.isPending}
                className="flex-1"
              >
                {backfill.isPending ? 'Re-linking...' : `Re-link ${rows.length} rows`}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Done ── */}
        {step === 'done' && result && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Re-link complete</h3>
                <p className="text-xs text-slate-500">Here's what happened:</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-700">{result.linked}</p>
                <p className="text-xs text-blue-600 mt-0.5">Prospects updated</p>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-center">
                <p className="text-2xl font-bold text-emerald-700">{result.companiesCreated}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Companies created</p>
              </div>
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-700">{result.contactsCreated}</p>
                <p className="text-xs text-purple-600 mt-0.5">Contacts created</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <p className="text-2xl font-bold text-slate-600">{result.skipped}</p>
                <p className="text-xs text-slate-500 mt-0.5">Skipped / no change</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-red-600">Errors ({result.errors.length})</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>Row {e.row}: {e.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep('upload'); setResult(null); setRows([]); setCsvHeaders([]); setColumnMap({}); }} className="flex-1">
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Run Again
              </Button>
              <Button onClick={onClose} className="flex-1">Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
