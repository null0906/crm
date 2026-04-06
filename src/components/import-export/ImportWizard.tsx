'use client';

import React, { useState, useCallback } from 'react';
import { Upload, ArrowRight, ArrowLeft, CheckCircle, AlertCircle, Download, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type EntityType = 'contact' | 'company' | 'deal';
type Step = 'upload' | 'map' | 'preview' | 'done';

interface ImportResult {
  created: number;
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
  { value: 'title', label: 'Deal Title *', mandatory: true },
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

function downloadTemplate(entityType: 'contact' | 'company' | 'deal') {
  const fields = entityType === 'contact' ? CONTACT_FIELDS : entityType === 'company' ? COMPANY_FIELDS : DEAL_FIELDS;
  const headers = fields.map((f) => f.mandatory ? `${f.label.replace(' *', '')} (mandatory)` : f.label);
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
      companySize: '51-200', companyType: 'prospect', annualRevenueRange: '₹10Cr–₹50Cr',
      twitterUrl: 'https://twitter.com/acmecorp',
      title: 'Acme — GRC Platform', stageName: 'Proposal Sent',
      contactName: 'John Doe',
      amount: '500000', currency: 'INR', probability: '40',
      expectedCloseDate: '2026-06-30',
    };
    return examples[f.value] ?? '';
  });
  const csv = [headers.join(','), exampleRow.join(',')].join('\n');
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

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
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
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);

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
      importContacts.mutate({ rows: trimmedRows, columnMap, skipDuplicates });
    } else if (entityType === 'company') {
      importCompanies.mutate({ rows: trimmedRows, columnMap, skipDuplicates });
    } else {
      if (!pipelineId) { toast.error('No pipeline selected'); return; }
      importDeals.mutate({ rows: trimmedRows, columnMap, pipelineId });
    }
  }

  const requiredFields = fields.filter((f) => f.mandatory).map((f) => f.value);
  const mappedValues = Object.values(columnMap);
  const missingRequired = requiredFields.filter((f) => !mappedValues.includes(f));

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
              Import {entityType === 'contact' ? 'contacts' : entityType === 'company' ? 'companies' : 'deals'} from a CSV file. Max 1,000 rows per import.
            </p>

            {entityType === 'deal' && pipelineName && (
              <div className="mb-4 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
                Deals will be imported into pipeline: <span className="font-semibold">{pipelineName}</span>. Use the <span className="font-semibold">Stage Name</span> column to assign stages — unrecognised values default to the first stage.
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
                onClick={() => downloadTemplate(entityType)}
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
              Match your CSV columns to {entityType === 'deal' ? 'deal' : entityType} fields. {rows.length} rows detected.
            </p>

            <div className="space-y-2">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-3">
                  <div className="w-40 text-sm text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded font-mono truncate flex-shrink-0">
                    {header}
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <select
                    value={columnMap[header] ?? ''}
                    onChange={(e) => setColumnMap((prev) => {
                      const next = { ...prev };
                      if (e.target.value) next[header] = e.target.value;
                      else delete next[header];
                      return next;
                    })}
                    className="flex-1 text-sm border border-slate-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Skip this column —</option>
                    {fields.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Required fields not mapped: {missingRequired.map((f) => fields.find((fd) => fd.value === f)?.label?.replace(' *', '')).join(', ')}</span>
              </div>
            )}

            {entityType !== 'deal' && (
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="skip-dup"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="skip-dup" className="text-sm text-slate-700">Skip duplicate emails</label>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Preview Import</h3>
            <p className="text-sm text-slate-500 mb-4">
              Importing {Math.min(rows.length, 1000)} {entityType === 'deal' ? 'deals' : `${entityType}s`} with {Object.keys(columnMap).length} mapped columns.
            </p>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">#</th>
                    {Object.entries(columnMap).map(([csv, field]) => (
                      <th key={csv} className="px-3 py-2 text-left text-slate-700 font-medium whitespace-nowrap">
                        {fields.find((f) => f.value === field)?.label?.replace(' *', '') ?? field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      {Object.entries(columnMap).map(([csv]) => (
                        <td key={csv} className="px-3 py-2 text-slate-700 max-w-[150px] truncate">
                          {row[csv] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && (
              <p className="text-xs text-slate-400 mt-2">Showing 5 of {rows.length} rows</p>
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
