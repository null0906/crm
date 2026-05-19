'use client';

import React, { useState, useCallback } from 'react';
import { Upload, ArrowRight, ArrowLeft, CheckCircle, AlertCircle, Download, X, Info } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type EntityType = 'contact' | 'company' | 'deal';
type Step = 'upload' | 'map' | 'preview' | 'done';

interface ImportResult {
  created: number;
  updated?: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

const CONTACT_FIELDS = [
  { value: 'firstName', label: 'First Name *', mandatory: true },
  { value: 'lastName', label: 'Last Name *', mandatory: true },
  { value: 'email', label: 'Email', mandatory: false },
  { value: 'secondaryEmail', label: 'Secondary Email', mandatory: false },
  { value: 'phone', label: 'Phone', mandatory: false },
  { value: 'mobile', label: 'Mobile', mandatory: false },
  { value: 'companyName', label: 'Company Name', mandatory: false },
  { value: 'jobTitle', label: 'Job Title', mandatory: false },
  { value: 'department', label: 'Department', mandatory: false },
  { value: 'linkedinUrl', label: 'LinkedIn URL', mandatory: false },
  { value: 'source', label: 'Source', mandatory: false },
  { value: 'status', label: 'Status', mandatory: false },
  { value: 'leadScore', label: 'Lead Score', mandatory: false },
  { value: 'addressLine1', label: 'Address Line 1', mandatory: false },
  { value: 'addressLine2', label: 'Address Line 2', mandatory: false },
  { value: 'city', label: 'City', mandatory: false },
  { value: 'state', label: 'State', mandatory: false },
  { value: 'postalCode', label: 'Postal Code', mandatory: false },
  { value: 'country', label: 'Country', mandatory: false },
  { value: 'description', label: 'Notes', mandatory: false },
];

const DEAL_FIELDS = [
  { value: 'title', label: 'Prospect Title *', mandatory: true },
  { value: 'stageName', label: 'Stage Name', mandatory: false },
  { value: 'contactName', label: 'Contact Name', mandatory: false },
  { value: 'companyName', label: 'Company Name', mandatory: false },
  { value: 'amount', label: 'Amount', mandatory: false },
  { value: 'currency', label: 'Currency', mandatory: false },
  { value: 'probability', label: 'Probability (%)', mandatory: false },
  { value: 'expectedCloseDate', label: 'Expected Close Date', mandatory: false },
  { value: 'description', label: 'Notes', mandatory: false },
];

const COMPANY_FIELDS = [
  { value: 'name', label: 'Company Name *', mandatory: true },
  { value: 'domain', label: 'Domain', mandatory: false },
  { value: 'website', label: 'Website', mandatory: false },
  { value: 'industry', label: 'Industry', mandatory: false },
  { value: 'subIndustry', label: 'Sub Industry', mandatory: false },
  { value: 'companySize', label: 'Company Size', mandatory: false },
  { value: 'companyType', label: 'Company Type', mandatory: false },
  { value: 'annualRevenueRange', label: 'Annual Revenue Range', mandatory: false },
  { value: 'phone', label: 'Phone', mandatory: false },
  { value: 'email', label: 'Email', mandatory: false },
  { value: 'linkedinUrl', label: 'LinkedIn URL', mandatory: false },
  { value: 'twitterUrl', label: 'Twitter URL', mandatory: false },
  { value: 'addressLine1', label: 'Address Line 1', mandatory: false },
  { value: 'addressLine2', label: 'Address Line 2', mandatory: false },
  { value: 'city', label: 'City', mandatory: false },
  { value: 'state', label: 'State', mandatory: false },
  { value: 'postalCode', label: 'Postal Code', mandatory: false },
  { value: 'country', label: 'Country', mandatory: false },
  { value: 'description', label: 'Notes', mandatory: false },
];

function csvCell(value: string): string {
  // Quote cells that contain commas or quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadTemplate(entityType: 'contact' | 'company' | 'deal', stages?: string[]) {
  const fields = entityType === 'contact' ? CONTACT_FIELDS : entityType === 'company' ? COMPANY_FIELDS : DEAL_FIELDS;

  // Build column headers with mandatory markers
  const headers = fields.map((f) => csvCell(f.mandatory ? `${f.label.replace(' *', '')} (mandatory)` : f.label));

  // Allowed values hints row (row 2 — shown as italic guidance, not imported as data)
  const allowedStages = stages && stages.length > 0 ? stages.join(' / ') : 'Proposal Sent';
  const allowedHints: Record<string, string> = {
    status: 'new / contacted / qualified / unqualified / nurturing / converted / lost / archived',
    source: 'apollo / manual / website / referral / event / cold_outreach',
    companyType: 'prospect / customer / partner / vendor / competitor / other',
    stageName: allowedStages,
    currency: 'INR / USD / EUR / GBP',
    probability: '0–100 (digits only)',
    amount: 'digits only e.g. 500000',
    leadScore: '0–100 (integer)',
    expectedCloseDate: 'YYYY-MM-DD e.g. 2026-06-30',
  };
  const hintsRow = fields.map((f) => csvCell(allowedHints[f.value] ?? ''));

  // Example data row
  const exampleRow = fields.map((f) => {
    const examples: Record<string, string> = {
      firstName: 'John', lastName: 'Doe', email: 'john@example.com', secondaryEmail: '',
      phone: '+91 98765 43210', mobile: '+91 91234 56789', companyName: 'Acme Corp',
      jobTitle: 'CISO', department: 'Security', linkedinUrl: 'https://linkedin.com/in/johndoe',
      source: 'manual', status: 'new', leadScore: '50',
      addressLine1: '123 MG Road', addressLine2: 'Floor 4', city: 'Mumbai',
      state: 'Maharashtra', postalCode: '400001', country: 'India',
      description: 'Met at RSA Conference',
      name: 'Acme Corp', domain: 'acme.com', website: 'https://acme.com',
      industry: 'Financial Services', subIndustry: 'Banking',
      companySize: '51-200', companyType: 'prospect', annualRevenueRange: '10Cr-50Cr',
      twitterUrl: 'https://twitter.com/acmecorp',
      title: 'Acme GRC Platform', stageName: stages?.[0] ?? 'Proposal Sent',
      contactName: 'John Doe',
      amount: '500000', currency: 'INR', probability: '40',
      expectedCloseDate: '2026-06-30',
    };
    return csvCell(examples[f.value] ?? '');
  });

  // Row 2 is a "GUIDE ROW" — label it clearly so user knows to delete it
  const guideLabel = fields.map((f, i) => i === 0 ? csvCell('--- ALLOWED VALUES (delete this row before importing) ---') : hintsRow[i] ?? '');

  const csv = [headers.join(','), guideLabel.join(','), exampleRow.join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entityType}_import_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface ImportWizardProps {
  entityType: EntityType;
  onClose: () => void;
  /** Required when entityType === 'deal'. Pass the currently selected pipeline id. */
  pipelineId?: string;
  /** Display name of the pipeline for the info banner. */
  pipelineName?: string;
}

function splitCSVLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = splitCSVLine(lines[0]!).map((h) => h.replace(/^"|"$/g, '').trim());

  const dataLines = lines.slice(1).filter((line) => {
    const firstCell = splitCSVLine(line)[0]?.replace(/^"|"$/g, '').trim() ?? '';
    // Skip the guide row generated by downloadTemplate
    return !firstCell.startsWith('--- ALLOWED VALUES');
  });

  const rows = dataLines.map((line) => {
    const values = splitCSVLine(line).map((v) => v.replace(/^"|"$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });

  return { headers, rows };
}

export function ImportWizard({ entityType, onClose, pipelineId, pipelineName }: ImportWizardProps) {
  const [step, setStep] = useState<Step>('upload');
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update' | 'overwrite' | 'create'>('skip');
  const [result, setResult] = useState<ImportResult | null>(null);

  // Fetch pipeline stages for deal template
  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery(
    { id: pipelineId ?? '' },
    { enabled: entityType === 'deal' && !!pipelineId }
  );
  const stageNames = ((pipelineData?.stages ?? []) as Array<{ name: string; position: number }>)
    .sort((a, b) => a.position - b.position)
    .map((s) => s.name);

  const fields = entityType === 'contact' ? CONTACT_FIELDS : entityType === 'company' ? COMPANY_FIELDS : DEAL_FIELDS;

  const importContacts = trpc.import.contacts.useMutation({
    onSuccess: (data) => { setResult(data); setStep('done'); },
    onError: (err) => toast.error('Import failed', { description: err.message }),
  });
  const importCompanies = trpc.import.companies.useMutation({
    onSuccess: (data) => { setResult(data); setStep('done'); },
    onError: (err) => toast.error('Import failed', { description: err.message }),
  });
  const importDeals = trpc.import.deals.useMutation({
    onSuccess: (data) => { setResult(data); setStep('done'); },
    onError: (err) => toast.error('Import failed', { description: err.message }),
  });

  const isPending = importContacts.isPending || importCompanies.isPending || importDeals.isPending;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const parsed = parseCSV(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      // Auto-map columns by name similarity
      const autoMap: Record<string, string> = {};
      parsed.headers.forEach((h) => {
        const lower = h.toLowerCase().replace(/[^a-z]/g, '');
        const matched = fields.find((f) => {
          const fLower = f.value.toLowerCase();
          return lower === fLower || lower.includes(fLower) || fLower.includes(lower);
        });
        if (matched) autoMap[h] = matched.value;
      });
      setColumnMap(autoMap);
      setStep('map');
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.csv')) {
      toast.error('Please drop a CSV file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const parsed = parseCSV(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const autoMap: Record<string, string> = {};
      parsed.headers.forEach((h) => {
        const lower = h.toLowerCase().replace(/[^a-z]/g, '');
        const matched = fields.find((f) => {
          const fLower = f.value.toLowerCase();
          return lower === fLower || lower.includes(fLower) || fLower.includes(lower);
        });
        if (matched) autoMap[h] = matched.value;
      });
      setColumnMap(autoMap);
      setStep('map');
    };
    reader.readAsText(file);
  }

  function handleImport() {
    const trimmedRows = rows.slice(0, 1000);
    if (entityType === 'contact') {
      importContacts.mutate({ rows: trimmedRows, columnMap, duplicateMode: duplicateMode === 'overwrite' ? 'overwrite' : duplicateMode });
    } else if (entityType === 'company') {
      importCompanies.mutate({ rows: trimmedRows, columnMap, duplicateMode: duplicateMode === 'overwrite' ? 'update' : duplicateMode });
    } else {
      if (!pipelineId) { toast.error('No pipeline selected'); return; }
      importDeals.mutate({ rows: trimmedRows, columnMap, pipelineId });
    }
  }

  const requiredFields = fields.filter((f) => f.mandatory).map((f) => f.value);
  const mappedValues = Object.values(columnMap);
  const missingRequired = requiredFields.filter((f) => !mappedValues.includes(f));

  // For deals: find which CSV column is mapped to stageName, then validate values
  const stageNameCSVCol = entityType === 'deal'
    ? Object.entries(columnMap).find(([, v]) => v === 'stageName')?.[0]
    : undefined;
  const stageNamesLower = stageNames.map((s) => s.toLowerCase());
  const rowsWithBadStage = stageNameCSVCol && stageNames.length > 0
    ? rows.filter((row) => {
        const val = row[stageNameCSVCol]?.trim();
        return val && !stageNamesLower.includes(val.toLowerCase());
      })
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Steps indicator */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-200 bg-slate-50">
        {(['upload', 'map', 'preview', 'done'] as Step[]).map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-blue-600' : ['upload', 'map', 'preview', 'done'].indexOf(step) > i ? 'text-green-600' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${step === s ? 'bg-blue-600 text-white' : ['upload', 'map', 'preview', 'done'].indexOf(step) > i ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {i + 1}
              </span>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
            {i < 3 && <div className="flex-1 h-px bg-slate-200" />}
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Upload CSV File</h3>
            <p className="text-sm text-slate-500 mb-4">
              Import {entityType === 'contact' ? 'contacts' : entityType === 'company' ? 'companies' : 'prospects'} from a CSV file. Max 1,000 rows per import.
            </p>

            {entityType === 'deal' && pipelineName && (
              <div className="mb-4 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700 space-y-1">
                <p>Prospects will be imported into pipeline: <span className="font-semibold">{pipelineName}</span>.</p>
                {stageNames.length > 0 && (
                  <p>
                    <span className="font-semibold">Allowed stages:</span>{' '}
                    {stageNames.map((s, i) => (
                      <span key={s}>
                        <span className="font-medium">{s}</span>{i < stageNames.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                    {'. '}Unrecognised values default to the first stage.
                  </p>
                )}
              </div>
            )}

            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors cursor-pointer"
              onClick={() => document.getElementById('csv-upload')?.click()}
            >
              <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">Drop your CSV here or click to browse</p>
              <p className="text-xs text-slate-400 mt-1">Only .csv files are supported</p>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-800 mb-1">Not sure about the format?</p>
                <p className="text-xs text-blue-700">
                  Download our template CSV — it includes all available fields with an example row.
                  Columns marked <span className="font-semibold">(mandatory)</span> must be filled in.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100"
                onClick={() => downloadTemplate(entityType, stageNames.length > 0 ? stageNames : undefined)}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Template
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Map columns */}
        {step === 'map' && (
          <div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Map Columns</h3>
            <p className="text-sm text-slate-500 mb-4">
              Match your CSV columns to {entityType === 'deal' ? 'prospect' : entityType} fields. {rows.length} rows detected.
            </p>

            {/* Stage reference card — shown for deals as soon as stages are loaded */}
            {entityType === 'deal' && stageNames.length > 0 && (
              <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-indigo-700">
                    Allowed Stage Names for <span className="font-bold">{pipelineName}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stageNames.map((s, i) => (
                    <span key={s} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-xs font-medium text-indigo-800">
                      <span className="text-indigo-400 font-mono text-[10px]">{i + 1}</span>
                      {s}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-indigo-500 mt-1.5">
                  Stage Name must match exactly (case-insensitive). Unrecognised values will fall back to stage 1 — <strong>{stageNames[0]}</strong>.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {headers.map((header) => {
                const mappedField = columnMap[header];
                const isStageCol = mappedField === 'stageName';
                return (
                  <div key={header} className="flex items-center gap-3">
                    <div className="w-40 text-sm text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded font-mono truncate flex-shrink-0">
                      {header}
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <select
                      value={mappedField ?? ''}
                      onChange={(e) => setColumnMap((prev) => {
                        const next = { ...prev };
                        if (e.target.value) next[header] = e.target.value;
                        else delete next[header];
                        return next;
                      })}
                      className={`flex-1 text-sm border rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${isStageCol ? 'border-indigo-300' : 'border-slate-200'}`}
                    >
                      <option value="">— Skip this column —</option>
                      {fields.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    {isStageCol && stageNames.length > 0 && (
                      <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded flex-shrink-0">
                        stage col
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {missingRequired.length > 0 && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Required fields not mapped: {missingRequired.map((f) => fields.find((fd) => fd.value === f)?.label?.replace(' *', '')).join(', ')}</span>
              </div>
            )}

            {/* Stage mismatch warning after mapping */}
            {rowsWithBadStage.length > 0 && stageNameCSVCol && (
              <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-semibold">
                    {rowsWithBadStage.length} row{rowsWithBadStage.length > 1 ? 's have' : ' has'} an unrecognised Stage Name.
                  </p>
                  <p className="mt-0.5">
                    Unrecognised values:{' '}
                    {[...new Set(rowsWithBadStage.map((r) => r[stageNameCSVCol]?.trim()).filter(Boolean))].slice(0, 5).map((v) => (
                      <span key={v} className="font-mono bg-amber-100 px-1 rounded mx-0.5">"{v}"</span>
                    ))}
                    {'. '}These rows will be assigned to stage 1 — <strong>{stageNames[0]}</strong>.
                  </p>
                </div>
              </div>
            )}

            {entityType !== 'deal' && (
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-600 mb-2">If a matching record already exists:</p>
                <div className="flex flex-col gap-1.5">
                  {([
                    { value: 'skip',      label: 'Skip it',               desc: 'Leave the existing record untouched' },
                    { value: 'update',    label: 'Fill in missing fields', desc: 'Adds email, phone, etc. only where the field is currently empty' },
                    { value: 'overwrite', label: 'Overwrite with CSV data', desc: 'Replaces all non-empty fields from the CSV — use to push updates' },
                    { value: 'create',    label: 'Always create new',      desc: 'Ignores matches — may create duplicates' },
                  ] as const).map(({ value, label, desc }) => (
                    <label
                      key={value}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${duplicateMode === value ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <input
                        type="radio"
                        name="dupMode"
                        value={value}
                        checked={duplicateMode === value}
                        onChange={() => setDuplicateMode(value)}
                        className="mt-0.5 accent-blue-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{label}</p>
                        <p className="text-xs text-slate-400">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">Match is by email first, then by first + last name. Fields supported: phone, mobile, email, job title, company, address, LinkedIn, notes.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Preview Import</h3>
            <p className="text-sm text-slate-500 mb-4">
              Importing {Math.min(rows.length, 1000)} {entityType === 'deal' ? 'prospects' : `${entityType}s`} with {Object.keys(columnMap).length} mapped columns.
            </p>

            {/* Stage summary for deals */}
            {entityType === 'deal' && stageNames.length > 0 && stageNameCSVCol && (
              <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                <p className="text-xs font-semibold text-indigo-700 mb-1">Stage distribution in your file</p>
                <div className="flex flex-wrap gap-1.5">
                  {stageNames.map((s) => {
                    const count = rows.filter((r) => r[stageNameCSVCol!]?.trim().toLowerCase() === s.toLowerCase()).length;
                    return (
                      <span key={s} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-xs text-indigo-800">
                        <span className="font-medium">{s}</span>
                        <span className="text-indigo-400 font-mono">{count}</span>
                      </span>
                    );
                  })}
                  {rowsWithBadStage.length > 0 && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-xs text-amber-800">
                      <AlertCircle className="w-3 h-3" />
                      <span className="font-medium">{rowsWithBadStage.length} unrecognised → stage 1</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">#</th>
                    {Object.entries(columnMap).map(([csv, field]) => (
                      <th key={csv} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${field === 'stageName' ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {fields.find((f) => f.value === field)?.label?.replace(' *', '') ?? field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 8).map((row, i) => {
                    const stageVal = stageNameCSVCol ? row[stageNameCSVCol]?.trim() : undefined;
                    const isBadStage = stageVal && stageNames.length > 0
                      && !stageNamesLower.includes(stageVal.toLowerCase());
                    return (
                      <tr key={i} className={isBadStage ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        {Object.entries(columnMap).map(([csv, field]) => {
                          const val = row[csv] ?? '—';
                          const isThisStageCell = field === 'stageName' && stageNameCSVCol === csv;
                          const isCellBad = isThisStageCell && val && stageNames.length > 0
                            && !stageNamesLower.includes(val.toLowerCase());
                          return (
                            <td key={csv} className={`px-3 py-2 max-w-[160px] truncate ${isCellBad ? 'text-amber-700 font-medium' : 'text-slate-700'}`}>
                              {val}
                              {isCellBad && (
                                <span className="ml-1 text-[10px] text-amber-500" title={`"${val}" not recognised — will use stage 1`}>⚠</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 8 && (
              <p className="text-xs text-slate-400 mt-2">Showing 8 of {rows.length} rows</p>
            )}
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && result && (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Import Complete</h3>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{result.created}</p>
                <p className="text-xs text-slate-500">Created</p>
              </div>
              {result.updated !== undefined && result.updated > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                  <p className="text-xs text-slate-500">Updated</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-400">{result.skipped}</p>
                <p className="text-xs text-slate-500">Skipped</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-4 text-left max-h-40 overflow-y-auto border border-red-200 rounded-lg p-3 bg-red-50">
                <p className="text-xs font-medium text-red-700 mb-2">{result.errors.length} errors:</p>
                {result.errors.slice(0, 20).map((err) => (
                  <p key={err.row} className="text-xs text-red-600">Row {err.row}: {err.message}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
        <Button variant="outline" onClick={step === 'upload' || step === 'done' ? onClose : () => setStep(step === 'map' ? 'upload' : 'map')}>
          {step === 'upload' || step === 'done' ? (
            <><X className="w-4 h-4 mr-1" />Close</>
          ) : (
            <><ArrowLeft className="w-4 h-4 mr-1" />Back</>
          )}
        </Button>

        {step === 'map' && (
          <Button
            onClick={() => setStep('preview')}
            disabled={missingRequired.length > 0 || Object.keys(columnMap).length === 0}
          >
            Preview <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        )}
        {step === 'preview' && (
          <Button onClick={handleImport} disabled={isPending}>
            {isPending ? 'Importing...' : `Import ${Math.min(rows.length, 1000)} rows`}
          </Button>
        )}
      </div>
    </div>
  );
}
