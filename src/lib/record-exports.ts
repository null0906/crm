/**
 * Column definitions for the Contacts and Prospects exports, plus one entry
 * point that writes them as either .xlsx or .csv, so both formats always carry
 * the same columns.
 *
 * CSV headers keep the camelCase `key` the Contacts CSV has always used, so
 * files that people round-trip through the import wizard keep working. The
 * Excel file uses the readable `header`.
 */
import { exportToCSV } from '@/lib/export-csv';
import { exportToXlsx, type XlsxColumn, type XlsxMeta, type XlsxSheet } from '@/lib/export-xlsx';
import { formatDate } from '@/lib/formatters';

export type ExportFormat = 'xlsx' | 'csv';

type Row = Record<string, unknown>;

export interface ExportColumn extends XlsxColumn {
  value: (row: Row) => unknown;
  /** CSV only: wrap as ="..." so Excel keeps leading zeros (phones, postal codes). */
  forceText?: boolean;
}

function str(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function fullName(first: unknown, last: unknown) {
  return `${str(first)} ${str(last)}`.trim();
}

/**
 * Writes `rows` in the chosen format. `extraSheets` only go into the Excel
 * file; the CSV holds the main sheet alone. `filename` has no extension.
 */
export async function exportRecords(
  format: ExportFormat,
  columns: ExportColumn[],
  rows: Row[],
  meta: Omit<XlsxMeta, 'filename'> & { filename: string; sheetName: string; extraSheets?: XlsxSheet[] }
) {
  if (format === 'csv') {
    const csvRows = rows.map((row) => Object.fromEntries(columns.map((column) => {
      const value = column.value(row);
      if (column.type === 'date') return [column.key, value ? formatDate(value as Date | string) : ''];
      // Blank stays null so exportToCSV writes an empty cell, not ="" for text columns.
      return [column.key, value === null || value === undefined || value === '' ? null : str(value)];
    })));
    const forceTextColumns = columns.filter((column) => column.forceText).map((column) => column.key);
    exportToCSV(csvRows, `${meta.filename}.csv`, { forceTextColumns });
    return;
  }

  const sheetRows = rows.map((row) => Object.fromEntries(columns.map((column) => [column.key, column.value(row)])));
  await exportToXlsx(
    [{ name: meta.sheetName, columns, rows: sheetRows }, ...(meta.extraSheets ?? [])],
    { title: meta.title, subtitle: meta.subtitle, filters: meta.filters, filename: `${meta.filename}.xlsx` }
  );
}

export const CONTACT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'firstName', header: 'First Name', width: 16, value: (c) => c.firstName },
  { key: 'lastName', header: 'Last Name', width: 16, value: (c) => c.lastName },
  { key: 'email', header: 'Email', width: 30, value: (c) => c.email },
  { key: 'secondaryEmail', header: 'Secondary Email', width: 28, value: (c) => c.secondaryEmail },
  { key: 'phone', header: 'Phone', width: 18, forceText: true, value: (c) => c.phone },
  { key: 'mobile', header: 'Mobile', width: 18, forceText: true, value: (c) => c.mobile },
  { key: 'jobTitle', header: 'Job Title', width: 24, value: (c) => c.jobTitle },
  { key: 'department', header: 'Department', width: 18, value: (c) => c.department },
  { key: 'company', header: 'Company', width: 26, value: (c) => c.companyName },
  { key: 'status', header: 'Status', width: 14, value: (c) => c.status },
  { key: 'source', header: 'Source', width: 16, value: (c) => c.source },
  { key: 'leadScore', header: 'Lead Score', width: 12, type: 'number', value: (c) => c.leadScore },
  { key: 'owner', header: 'Owner', width: 20, value: (c) => fullName(c.ownerFirstName, c.ownerLastName) },
  { key: 'initialTouch', header: 'Initial Touch', width: 16, value: (c) => c.initialActivityType },
  { key: 'initialTouchAt', header: 'Initial Touch At', width: 16, type: 'date', value: (c) => c.initialActivityAt },
  { key: 'location', header: 'Location', width: 20, value: (c) => c.location },
  { key: 'city', header: 'City', width: 16, value: (c) => c.city },
  { key: 'state', header: 'State', width: 16, value: (c) => c.state },
  { key: 'postalCode', header: 'Postal Code', width: 12, forceText: true, value: (c) => c.postalCode },
  { key: 'country', header: 'Country', width: 16, value: (c) => c.country },
  { key: 'linkedIn', header: 'LinkedIn', width: 30, value: (c) => c.linkedinUrl },
  { key: 'notes', header: 'Notes', width: 40, value: (c) => c.description },
  { key: 'lastContacted', header: 'Last Contacted', width: 16, type: 'date', value: (c) => c.lastContactedAt },
  { key: 'createdAt', header: 'Created', width: 16, type: 'date', value: (c) => c.createdAt },
  { key: 'updatedAt', header: 'Updated', width: 16, type: 'date', value: (c) => c.updatedAt },
];

function dealServices(d: Row) {
  const services = Array.isArray(d.services) ? (d.services as unknown[]).map(str).filter(Boolean) : [];
  const other = str(d.serviceOther).trim();
  if (other) services.push(other);
  return services.join(', ');
}

export const DEAL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'title', header: 'Title', width: 32, value: (d) => d.title },
  { key: 'company', header: 'Company', width: 26, value: (d) => d.companyName },
  { key: 'primaryContact', header: 'Primary Contact', width: 22, value: (d) => d.primaryContactName },
  { key: 'contactEmail', header: 'Contact Email', width: 28, value: (d) => d.primaryContactEmail },
  { key: 'contactPhone', header: 'Contact Phone', width: 18, forceText: true, value: (d) => d.primaryContactPhone },
  { key: 'stage', header: 'Stage', width: 20, value: (d) => d.stageName },
  { key: 'status', header: 'Status', width: 12, value: (d) => d.status },
  { key: 'owner', header: 'Owner', width: 20, value: (d) => d.ownerName },
  { key: 'amount', header: 'Amount', width: 16, type: 'number', numFmt: '#,##0.00', value: (d) => d.amount },
  { key: 'effectiveValue', header: 'Effective Value', width: 16, type: 'number', numFmt: '#,##0.00', value: (d) => d.effectiveValue },
  { key: 'currency', header: 'Currency', width: 10, value: (d) => d.currency },
  { key: 'probability', header: 'Probability %', width: 13, type: 'number', value: (d) => d.probability },
  { key: 'services', header: 'Services', width: 30, value: dealServices },
  { key: 'expectedCloseDate', header: 'Expected Close', width: 16, type: 'date', value: (d) => d.expectedCloseDate },
  { key: 'partner', header: 'Partner', width: 22, value: (d) => d.partnerCompanyName },
  { key: 'referredBy', header: 'Referred By', width: 22, value: (d) => d.referredByPartnerName },
  { key: 'delayed', header: 'Delayed?', width: 10, value: (d) => (d.isDelayed ? 'Yes' : 'No') },
  { key: 'delayReason', header: 'Delay Reason', width: 30, value: (d) => d.delayReason },
  { key: 'tasks', header: 'Tasks (done/total)', width: 16, value: (d) => (Number(d.taskCount ?? 0) > 0 ? `${str(d.completedTaskCount ?? 0)}/${str(d.taskCount)}` : '') },
  { key: 'createdAt', header: 'Created', width: 16, type: 'date', value: (d) => d.createdAt },
  { key: 'updatedAt', header: 'Updated', width: 16, type: 'date', value: (d) => d.updatedAt },
];

/**
 * The "By Stage" sheet: one row per stage in board order, with the number of
 * prospects and their summed amount. Deals whose amount is hidden (null) are
 * counted but add nothing to the total.
 */
export function dealStageSummarySheet(stages: Array<{ id: string; name: string }>, deals: Row[]): XlsxSheet {
  const rows = stages.map((stage) => {
    const inStage = deals.filter((deal) => deal.stageId === stage.id);
    const total = inStage.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0);
    return { stage: stage.name, count: inStage.length, amount: total };
  });
  return {
    name: 'By Stage',
    columns: [
      { key: 'stage', header: 'Stage', width: 26 },
      { key: 'count', header: 'Prospects', width: 12, type: 'number' },
      { key: 'amount', header: 'Total Amount', width: 18, type: 'number', numFmt: '#,##0.00' },
    ],
    rows,
  };
}
