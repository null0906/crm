import {
  decodeSheetBytes,
  parseDelimited,
  parseScopingGrid,
  type ParsedScopingSheet,
  type SheetEncoding,
} from './scoping-sheet';
import type { ScopingSourceFormat } from './types';

/**
 * Turning a file the person picked into a grid.
 *
 * The I/O boundary, deliberately kept apart from `scoping-sheet.ts`: this half
 * needs `File`, `ArrayBuffer` and a dynamic `import('exceljs')`, none of which
 * belong in a module that has to stay unit-testable. All the judgement lives
 * next door; what is here is decoding bytes and unzipping a workbook.
 */

export interface ReadScopingFileResult extends ParsedScopingSheet {
  fileName: string;
  sourceFormat: ScopingSourceFormat;
  /** Null for xlsx, which carries its own encoding inside the zip. */
  encoding: SheetEncoding | null;
  sheetName: string | null;
  /** Kept so a column override re-parses without re-reading the file. */
  grid: string[][];
}

/** Five megabytes. A questionnaire is text; anything larger is a mistake. */
export const MAX_SCOPING_FILE_BYTES = 5 * 1024 * 1024;

export class ScopingFileError extends Error {
  constructor(
    message: string,
    /** Shown under the headline. Says what to do, not what went wrong. */
    readonly hint?: string
  ) {
    super(message);
    this.name = 'ScopingFileError';
  }
}

/**
 * One exceljs cell to a string.
 *
 * Cell values are not strings and frequently not primitives: a cell with any
 * inline formatting arrives as `{ richText: [...] }`, a link as
 * `{ text, hyperlink }`, a formula as `{ formula, result }`. `String(value)` on
 * any of those renders "[object Object]" into the stored answer, which is the
 * sort of thing nobody notices until a client reads it back.
 */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    }
    // A formula cell carries both; the cached result is what was on screen.
    if ('result' in v) return cellToString(v.result);
    if ('text' in v) return String(v.text ?? '');
    // An error cell (#REF!, #N/A) is not an answer.
    if ('error' in v) return '';
  }
  return String(value);
}

function isXlsx(file: File): boolean {
  return (
    /\.xlsx$/i.test(file.name) ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

async function readXlsx(file: File): Promise<{ grid: string[][]; sheetName: string | null }> {
  // The same dynamic-import shape the report exporters use. exceljs is close to
  // a megabyte and must not enter the estimate builder's bundle — it loads only
  // once somebody actually picks a workbook.
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  // A returned questionnaire routinely travels beside an instructions tab and a
  // change log, and picking the wrong one is the difference between a complete
  // sheet and an empty one. Prefer the first visible tab with more than a
  // header row in it.
  const sheet =
    workbook.worksheets.find((s) => s.state !== 'hidden' && (s.actualRowCount ?? 0) > 1) ??
    workbook.worksheets[0];
  if (!sheet) {
    throw new ScopingFileError('That workbook has no sheets in it.');
  }

  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const width = Math.max(row.cellCount ?? 0, sheet.columnCount ?? 0);
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellToString(row.getCell(c).value));
    grid.push(cells);
  });

  return { grid, sheetName: sheet.name ?? null };
}

/**
 * Reads a picked file and parses it, or explains why it could not.
 *
 * `forced` re-parses the grid it already holds against columns the person
 * chose, so changing the mapping costs no second read.
 */
export async function readScopingFile(
  file: File,
  forced?: { question: number; answer: number }
): Promise<ReadScopingFileResult> {
  // BIFF8. exceljs cannot read it, and the generic failure would send someone
  // hunting a bug that is not there.
  if (/\.xls$/i.test(file.name)) {
    throw new ScopingFileError(
      'That is an older .xls file',
      'Open it in Excel and save it again as .xlsx or CSV, then try that one.'
    );
  }
  if (file.size > MAX_SCOPING_FILE_BYTES) {
    throw new ScopingFileError(
      'That file is too large',
      'A scoping questionnaire is text. Five megabytes is the ceiling.'
    );
  }
  if (file.size === 0) {
    throw new ScopingFileError('That file is empty.');
  }

  if (isXlsx(file)) {
    const { grid, sheetName } = await readXlsx(file);
    return {
      ...parseScopingGrid(grid, forced),
      fileName: file.name,
      sourceFormat: 'xlsx',
      encoding: null,
      sheetName,
      grid,
    };
  }

  const { text, encoding } = decodeSheetBytes(await file.arrayBuffer());
  const grid = parseDelimited(text);
  return {
    ...parseScopingGrid(grid, forced),
    fileName: file.name,
    sourceFormat: 'csv',
    encoding,
    sheetName: null,
    grid,
  };
}

/** Re-parses an already-read grid against a different column pair. */
export function reparse(
  previous: ReadScopingFileResult,
  forced: { question: number; answer: number }
): ReadScopingFileResult {
  return { ...previous, ...parseScopingGrid(previous.grid, forced) };
}
