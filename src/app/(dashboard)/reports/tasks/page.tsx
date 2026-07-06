'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

type TaskRow = Record<string, any>;
type SummaryRow = Record<string, any>;

function weekRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function h(value: unknown) {
  return Number(value ?? 0).toFixed(1);
}

function hours(value: unknown) {
  return `${h(value)}h`;
}

function dt(value: unknown) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(String(value)));
}

function linked(task: TaskRow) {
  if (task.linkedProjectId) return task.linkedProjectName ?? 'Project';
  if (task.linkedDealId) return task.linkedDealTitle ?? 'Prospect';
  if (task.isInternal) return 'Internal';
  return 'Unlinked';
}

function memberName(task: TaskRow) {
  return `${task.userFirstName ?? ''} ${task.userLastName ?? ''}`.trim() || 'Unknown member';
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function reportRows(rows: TaskRow[]) {
  return rows.map((task) => ({
    Member: memberName(task),
    Task: task.taskName ?? '',
    Client: task.linkedProjectCompanyName ?? task.linkedDealCompanyName ?? '',
    LinkedTo: linked(task),
    Status: String(task.status ?? '').replace('_', ' '),
    Hours: task.hoursSpent ? h(task.hoursSpent) : '',
    Started: dt(task.startedAt),
    Completed: dt(task.completedAt),
  }));
}

function downloadCsv(rows: TaskRow[], filename = `personal-task-report-${new Date().toISOString().slice(0, 10)}.csv`) {
  const headers = ['Member', 'Task', 'Linked to', 'Status', 'Hours', 'Started', 'Completed'];
  const lines = rows.map((task) => [
    memberName(task),
    task.taskName ?? '',
    linked(task),
    task.status ?? '',
    task.hoursSpent ?? '',
    task.startedAt ?? '',
    task.completedAt ?? '',
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  saveBlob(new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

async function downloadExcel(rows: TaskRow[], summary: SummaryRow[], meta: { title: string; period: string; filters: string[]; filename: string }) {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = (ExcelJSModule.default ?? ExcelJSModule) as typeof import('exceljs');
  const details = reportRows(rows);
  const summaryRows = summary.map((row) => ({
    Member: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    Total: row.total_tasks ?? 0,
    Completed: row.completed_tasks ?? 0,
    Hours: Number(h(row.total_hours)),
    ProjectHours: Number(h(row.project_hours)),
    ProspectHours: Number(h(row.prospect_hours)),
    InternalHours: Number(h(row.internal_hours)),
  }));
  const summaryData = summaryRows.length ? summaryRows : [{ Member: 'No matching members', Total: 0, Completed: 0, Hours: 0, ProjectHours: 0, ProspectHours: 0, InternalHours: 0 }];
  const detailData = details.length ? details : [{ Member: 'No matching tasks', Task: '', Client: '', LinkedTo: '', Status: '', Hours: '', Started: '', Completed: '' }];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SecComply';
  workbook.created = new Date();

  function buildSheet(name: string, headers: string[], data: Record<string, unknown>[], widths: number[]) {
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: meta.filters.length + 5 }],
      properties: { defaultRowHeight: 22 },
    });
    sheet.columns = headers.map((header, index) => ({ key: header, width: widths[index] ?? 18 }));
    sheet.mergeCells(1, 1, 1, headers.length);
    sheet.getCell(1, 1).value = meta.title;
    sheet.getCell(1, 1).font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF1D4ED8' } };
    sheet.getCell(1, 1).alignment = { vertical: 'middle' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells(2, 1, 2, headers.length);
    sheet.getCell(2, 1).value = meta.period;
    sheet.getCell(2, 1).font = { name: 'Arial', size: 10, color: { argb: 'FF64748B' } };

    meta.filters.forEach((filter, index) => {
      const rowNumber = index + 3;
      sheet.mergeCells(rowNumber, 1, rowNumber, headers.length);
      const cell = sheet.getCell(rowNumber, 1);
      cell.value = filter;
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF3730A3' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFC7D2FE' } } };
    });

    const headerRowNumber = meta.filters.length + 4;
    const headerRow = sheet.getRow(headerRowNumber);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } } };
    });
    headerRow.height = 24;

    data.forEach((row, rowIndex) => {
      const excelRow = sheet.getRow(headerRowNumber + rowIndex + 1);
      headers.forEach((header, colIndex) => {
        const cell = excelRow.getCell(colIndex + 1);
        const value = row[header];
        const numeric = ['Total', 'Completed', 'Hours', 'ProjectHours', 'ProspectHours', 'InternalHours'].includes(header);
        cell.value = numeric && value !== '' ? Number(value) : String(value ?? '');
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF111827' } };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
        if (rowIndex % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
    });
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: headers.length },
    };
  }

  buildSheet('Summary', Object.keys(summaryData[0]!), summaryData, [26, 12, 14, 12, 16, 17, 16]);
  buildSheet('Task Log', Object.keys(detailData[0]!), detailData, [22, 38, 24, 30, 14, 10, 18, 18]);

  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), meta.filename);
}

const pdfStyles = StyleSheet.create({
  page: { padding: 34, fontSize: 8.5, fontFamily: 'Helvetica', color: '#111827' },
  brand: { color: '#2563eb', fontSize: 12, fontWeight: 700, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  meta: { color: '#64748b', marginBottom: 8 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 },
  filter: { backgroundColor: '#eef2ff', color: '#3730a3', padding: 4, borderRadius: 3 },
  section: { color: '#2563eb', fontSize: 11, fontWeight: 700, marginTop: 12, marginBottom: 6 },
  table: { borderWidth: 1, borderColor: '#dbe3f0' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  th: { backgroundColor: '#2563eb', color: '#fff', fontWeight: 700, padding: 5 },
  td: { padding: 5 },
});

function PdfCell({ children, width, header }: { children: React.ReactNode; width: string; header?: boolean }) {
  return <Text style={[header ? pdfStyles.th : pdfStyles.td, { width }]}>{children}</Text>;
}

function TaskReportPdf({ rows, summary, meta }: { rows: TaskRow[]; summary: SummaryRow[]; meta: { title: string; period: string; filters: string[] } }) {
  const detailRows = reportRows(rows);
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={pdfStyles.page}>
        <Text style={pdfStyles.brand}>SecComply</Text>
        <Text style={pdfStyles.title}>{meta.title}</Text>
        <Text style={pdfStyles.meta}>{meta.period}</Text>
        <View style={pdfStyles.filters}>{meta.filters.map((filter) => <Text key={filter} style={pdfStyles.filter}>{filter}</Text>)}</View>
        <Text style={pdfStyles.section}>Team Summary</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tr}><PdfCell header width="28%">Member</PdfCell><PdfCell header width="12%">Total</PdfCell><PdfCell header width="12%">Completed</PdfCell><PdfCell header width="12%">Hours</PdfCell><PdfCell header width="12%">Projects</PdfCell><PdfCell header width="12%">Prospects</PdfCell><PdfCell header width="12%">Internal</PdfCell></View>
          {(summary.length ? summary : [{ first_name: 'No matching', last_name: 'members', total_tasks: 0, completed_tasks: 0, total_hours: 0, project_hours: 0, prospect_hours: 0, internal_hours: 0 }]).map((row, index) => (
            <View key={`${row.user_id ?? index}`} style={pdfStyles.tr}><PdfCell width="28%">{row.first_name} {row.last_name}</PdfCell><PdfCell width="12%">{row.total_tasks}</PdfCell><PdfCell width="12%">{row.completed_tasks}</PdfCell><PdfCell width="12%">{hours(row.total_hours)}</PdfCell><PdfCell width="12%">{hours(row.project_hours)}</PdfCell><PdfCell width="12%">{hours(row.prospect_hours)}</PdfCell><PdfCell width="12%">{hours(row.internal_hours)}</PdfCell></View>
          ))}
        </View>
        <Text style={pdfStyles.section}>Detailed Task Log</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tr}><PdfCell header width="16%">Member</PdfCell><PdfCell header width="24%">Task</PdfCell><PdfCell header width="16%">Client</PdfCell><PdfCell header width="16%">Linked</PdfCell><PdfCell header width="9%">Status</PdfCell><PdfCell header width="7%">Hours</PdfCell><PdfCell header width="12%">Started</PdfCell></View>
          {(detailRows.length ? detailRows.slice(0, 80) : [{ Member: 'No matching tasks', Task: '', Client: '', LinkedTo: '', Status: '', Hours: '', Started: '' }]).map((row, index) => (
            <View key={index} style={pdfStyles.tr}><PdfCell width="16%">{row.Member}</PdfCell><PdfCell width="24%">{row.Task}</PdfCell><PdfCell width="16%">{row.Client}</PdfCell><PdfCell width="16%">{row.LinkedTo}</PdfCell><PdfCell width="9%">{row.Status}</PdfCell><PdfCell width="7%">{row.Hours}</PdfCell><PdfCell width="12%">{row.Started}</PdfCell></View>
          ))}
        </View>
        {detailRows.length > 80 && <Text style={[pdfStyles.meta, { marginTop: 8 }]}>Showing first 80 task rows in PDF. Use Excel for the full detailed log.</Text>}
      </Page>
    </Document>
  );
}

async function downloadPdf(rows: TaskRow[], summary: SummaryRow[], meta: { title: string; period: string; filters: string[]; filename: string }) {
  const blob = await pdf(<TaskReportPdf rows={rows} summary={summary} meta={meta} />).toBlob();
  saveBlob(blob, meta.filename);
}

export default function TaskReportsPage() {
  const { data: session } = useSession();
  const role = (((session?.user as Record<string, unknown> | undefined)?.role as Record<string, unknown> | undefined)?.slug);
  const defaultRange = React.useMemo(weekRange, []);
  const [from, setFrom] = React.useState(defaultRange.from);
  const [to, setTo] = React.useState(defaultRange.to);
  const [userId, setUserId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [linkType, setLinkType] = React.useState('');
  const [companyId, setCompanyId] = React.useState('');
  const [exporting, setExporting] = React.useState('');
  const { data: users = [] } = trpc.users.list.useQuery();
  const { data: companiesData } = trpc.companies.list.useQuery({ pagination: { limit: 500 } });
  const reportFilters = {
    userId: userId || undefined,
    status: (status as 'in_progress' | 'completed' | 'cancelled') || undefined,
    linkType: (linkType as 'project' | 'deal' | 'internal' | 'any') || undefined,
    companyId: companyId || undefined,
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59`).toISOString(),
  };
  const { data: summary = [] } = trpc.personalTasks.teamSummary.useQuery(
    reportFilters,
    { enabled: role === 'super_admin' }
  );
  const { data: tasks = [] } = trpc.personalTasks.listAll.useQuery(
    reportFilters,
    { enabled: role === 'super_admin' }
  );

  const companies = (companiesData?.items ?? []) as Array<Record<string, unknown>>;
  const selectedUser = users.find((user) => user.id === userId);
  const selectedCompany = companies.find((company) => String(company.id) === companyId);
  const selectedName = selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : 'All members';
  const periodLabel = `${from} to ${to}`;
  const appliedFilters = [
    `Period: ${periodLabel}`,
    `Member: ${selectedName}`,
    companyId ? `Client: ${String(selectedCompany?.name ?? 'Selected client')}` : 'Client: All clients',
    status ? `Status: ${status.replace('_', ' ')}` : 'Status: All statuses',
    linkType ? `Link: ${linkType}` : 'Link: All links',
  ];
  const reportTitle = userId ? `Task Report - ${selectedName}` : 'Consolidated Task Report';
  const filePrefix = `task-report-${selectedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}`;

  async function exportPdfFor(rows: TaskRow[], summaryRows: SummaryRow[], suffix = filePrefix, title = reportTitle, filters = appliedFilters) {
    setExporting(`pdf-${suffix}`);
    try {
      await downloadPdf(rows, summaryRows, { title, period: periodLabel, filters, filename: `${suffix}.pdf` });
    } finally {
      setExporting('');
    }
  }

  async function exportExcelFor(rows: TaskRow[], summaryRows: SummaryRow[], suffix = filePrefix, title = reportTitle, filters = appliedFilters) {
    setExporting(`xlsx-${suffix}`);
    try {
      await downloadExcel(rows, summaryRows, { title, period: periodLabel, filters, filename: `${suffix}.xlsx` });
    } finally {
      setExporting('');
    }
  }

  if (role && role !== 'super_admin') {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Task reports are restricted to super admins.</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--surface-page)] p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]"><FileSpreadsheet className="h-5 w-5 text-[var(--accent)]" />Task Reports</h1>
              <p className="text-sm text-[var(--text-tertiary)]">Team time tracking across personal task logs.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => downloadCsv(tasks as TaskRow[], `${filePrefix}.csv`)}><Download className="h-4 w-4" />CSV</Button>
              <Button variant="outline" onClick={() => void exportExcelFor(tasks as TaskRow[], summary as SummaryRow[])} disabled={Boolean(exporting)}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
              <Button onClick={() => exportPdfFor(tasks as TaskRow[], summary as SummaryRow[])} disabled={Boolean(exporting)}><FileText className="h-4 w-4" />{exporting ? 'Preparing...' : 'PDF'}</Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <select value="" onChange={(e) => {
              const now = new Date();
              const nextFrom = new Date(now);
              if (e.target.value === '7') nextFrom.setDate(now.getDate() - 6);
              if (e.target.value === '30') nextFrom.setDate(now.getDate() - 29);
              if (e.target.value === '90') nextFrom.setDate(now.getDate() - 89);
              if (e.target.value) {
                setFrom(nextFrom.toISOString().slice(0, 10));
                setTo(now.toISOString().slice(0, 10));
              }
            }} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">Quick range</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">All members</option>{users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}
            </select>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">All clients</option>{companies.map((company) => <option key={String(company.id)} value={String(company.id)}>{String(company.name ?? 'Unnamed client')}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">All statuses</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
            <select value={linkType} onChange={(e) => setLinkType(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">All links</option><option value="project">Projects</option><option value="deal">Prospects</option><option value="internal">Internal</option>
            </select>
            {(from !== defaultRange.from || to !== defaultRange.to || userId || companyId || status || linkType) && (
              <Button variant="ghost" onClick={() => { setFrom(defaultRange.from); setTo(defaultRange.to); setUserId(''); setCompanyId(''); setStatus(''); setLinkType(''); }}>Reset</Button>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white shadow-sm">
          <div className="border-b border-[var(--border-subtle)] px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Team Summary</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400"><tr><th className="px-4 py-3">Member</th><th>Total</th><th>Completed</th><th>Hours</th><th>Projects</th><th>Prospects</th><th>Internal</th><th className="pr-4 text-right">Downloads</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(summary as SummaryRow[]).map((row) => {
                  const rowUserId = String(row.user_id);
                  const rowTasks = (tasks as TaskRow[]).filter((task) => task.userId === rowUserId);
                  const rowSummary = [row];
                  const rowName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'member';
                  const rowPrefix = `task-report-${rowName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}`;
                  const rowTitle = `Task Report - ${rowName}`;
                  const rowFilters = appliedFilters.map((filter) => filter.startsWith('Member:') ? `Member: ${rowName}` : filter);
                  return <tr key={row.user_id} className="cursor-pointer hover:bg-blue-50/50" onClick={() => setUserId(rowUserId)}><td className="px-4 py-3 font-bold">{row.first_name} {row.last_name}</td><td>{row.total_tasks}</td><td>{row.completed_tasks}</td><td>{h(row.total_hours)}</td><td>{h(row.project_hours)}</td><td>{h(row.prospect_hours)}</td><td>{h(row.internal_hours)}</td><td className="pr-4"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" disabled={Boolean(exporting)} onClick={(event) => { event.stopPropagation(); void exportExcelFor(rowTasks, rowSummary, rowPrefix, rowTitle, rowFilters); }}>Excel</Button><Button size="sm" variant="ghost" disabled={Boolean(exporting)} onClick={(event) => { event.stopPropagation(); void exportPdfFor(rowTasks, rowSummary, rowPrefix, rowTitle, rowFilters); }}>PDF</Button></div></td></tr>;
                })}
                {(summary as SummaryRow[]).length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No team summary rows match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white shadow-sm">
          <div className="border-b border-[var(--border-subtle)] px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Detailed Task Log</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400"><tr><th className="px-4 py-3">Member</th><th>Task</th><th>Linked to</th><th>Status</th><th>Hours</th><th>Started</th><th>Completed</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(tasks as TaskRow[]).map((task) => <tr key={task.id}><td className="px-4 py-3 font-semibold">{task.userFirstName} {task.userLastName}</td><td className="font-bold text-slate-900">{task.taskName}</td><td>{linked(task)}</td><td><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold">{String(task.status).replace('_', ' ')}</span></td><td>{task.hoursSpent ? h(task.hoursSpent) : '-'}</td><td>{dt(task.startedAt)}</td><td>{dt(task.completedAt)}</td></tr>)}
                {(tasks as TaskRow[]).length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No task rows match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
