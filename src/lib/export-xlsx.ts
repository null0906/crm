/**
 * Client-side .xlsx export shared by the Contacts, Prospects and Task report
 * pages. Every sheet gets the same layout: a title row, a subtitle row, one row
 * per active filter, then a styled header with autofilter and banded data rows.
 *
 * exceljs is loaded with a dynamic import so it only downloads when someone
 * actually exports.
 */

export type XlsxColumnType = 'text' | 'number' | 'date';

export interface XlsxColumn {
  key: string;
  header: string;
  width?: number;
  /**
   * `number` writes a real number (blank stays blank), `date` writes a real
   * date cell, `text` (the default) writes a string — use it for phone numbers
   * and postal codes so Excel keeps their leading zeros.
   */
  type?: XlsxColumnType;
  /** Excel number format, e.g. '#,##0.00'. Dates default to 'dd mmm yyyy'. */
  numFmt?: string;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
  /** Written into the first column when `rows` is empty. */
  emptyMessage?: string;
}

export interface XlsxMeta {
  title: string;
  subtitle?: string;
  filters?: string[];
  filename: string;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function toCellValue(value: unknown, type: XlsxColumnType | undefined): string | number | Date {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  if (type === 'date') {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d;
  }
  return String(value);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportToXlsx(sheets: XlsxSheet[], meta: XlsxMeta) {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = (ExcelJSModule.default ?? ExcelJSModule) as typeof import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SecComply';
  workbook.created = new Date();

  const filters = meta.filters ?? [];

  for (const def of sheets) {
    const { columns } = def;
    const headerRowNumber = filters.length + 4;
    const sheet = workbook.addWorksheet(def.name.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: headerRowNumber }],
      properties: { defaultRowHeight: 22 },
    });
    sheet.columns = columns.map((column) => ({ key: column.key, width: column.width ?? 18 }));

    sheet.mergeCells(1, 1, 1, columns.length);
    sheet.getCell(1, 1).value = meta.title;
    sheet.getCell(1, 1).font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF1D4ED8' } };
    sheet.getCell(1, 1).alignment = { vertical: 'middle' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells(2, 1, 2, columns.length);
    sheet.getCell(2, 1).value = meta.subtitle ?? '';
    sheet.getCell(2, 1).font = { name: 'Arial', size: 10, color: { argb: 'FF64748B' } };

    filters.forEach((filter, index) => {
      const rowNumber = index + 3;
      sheet.mergeCells(rowNumber, 1, rowNumber, columns.length);
      const cell = sheet.getCell(rowNumber, 1);
      cell.value = filter;
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF3730A3' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFC7D2FE' } } };
    });

    const headerRow = sheet.getRow(headerRowNumber);
    columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } } };
    });
    headerRow.height = 24;

    const rows = def.rows.length > 0
      ? def.rows
      : [{ [columns[0]!.key]: def.emptyMessage ?? 'No matching rows' }];

    rows.forEach((row, rowIndex) => {
      const excelRow = sheet.getRow(headerRowNumber + rowIndex + 1);
      columns.forEach((column, colIndex) => {
        const cell = excelRow.getCell(colIndex + 1);
        // The empty-state message is text even when the first column is numeric.
        const type = def.rows.length === 0 ? 'text' : column.type;
        cell.value = toCellValue(row[column.key], type);
        const numFmt = column.numFmt ?? (type === 'date' ? 'dd mmm yyyy' : undefined);
        if (numFmt) cell.numFmt = numFmt;
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
      to: { row: headerRowNumber, column: columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(new Blob([buffer], { type: XLSX_MIME }), meta.filename);
}
