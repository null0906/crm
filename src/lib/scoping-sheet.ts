/**
 * Reading a client's returned scoping questionnaire.
 *
 * This is the free-text sheet the client fills in and emails back — not the
 * sizing drivers this system asks internally. Nothing here feeds the cost
 * engine: the result is read by a person while they decide hours and headcount,
 * and it moves no number.
 *
 * Pure and DOM-free on purpose. The browser-only half — choosing an encoding,
 * unzipping an .xlsx through exceljs — lives in `scoping-sheet-file.ts`, so the
 * part with all the judgement in it can be unit-tested. And it is nearly all
 * judgement: these are hand-maintained spreadsheets carrying two dozen trailing
 * empty columns, several hundred blank rows at the end, section headings that
 * are a row with nothing in the answer cell, separator rows that are a single
 * space, and answers with newlines and tabs inside them.
 */

/** Mirrors the 1000-row cap the import router already sets. */
export const MAX_SCOPING_ROWS = 1000;
export const MAX_SCOPING_QUESTION_CHARS = 2_000;
export const MAX_SCOPING_ANSWER_CHARS = 20_000;
export const MAX_SCOPING_SECTION_CHARS = 200;
/**
 * The cap that actually matters.
 *
 * 1,000 rows x 20,000 characters is a 20 MB JSON body, which the per-field caps
 * happily permit and which lands either as a proxy 413 or as a 20 MB string to
 * validate, transform and insert. The row and field caps stop individual
 * absurdities; this stops their product.
 */
export const MAX_SCOPING_TOTAL_CHARS = 500_000;

export interface ScopingRow {
  /** The heading in force when this row was read; null before the first one. */
  section: string | null;
  question: string;
  answer: string | null;
  isSectionHeader: boolean;
}

export interface ParsedScopingSheet {
  rows: ScopingRow[];
  /** Null when no columns could be worked out — the UI then asks. */
  columns: { question: number; answer: number } | null;
  /** True when no labelled header was found and the columns were inferred. */
  guessed: boolean;
  /** Columns surviving the trailing-empty trim, for the override picker. */
  usedColumns: { index: number; label: string; sample: string }[];
  /** Rows in the file that carried nothing, so the count on screen is explainable. */
  dropped: number;
  /** Questions the client left blank. Worth knowing before committing hours. */
  unanswered: number;
  truncated: boolean;
  sections: string[];
}

const QUESTION_HEADERS = new Set([
  'question', 'questions', 'query', 'queries', 'item', 'items', 'area', 'topic', 'q',
]);
const ANSWER_HEADERS = new Set([
  'response', 'responses', 'answer', 'answers', 'reply', 'replies',
  'clientresponse', 'clientanswer', 'clientinput', 'remarks', 'comments', 'a',
]);

const headerKey = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Counted outside quotes over the first few KB.
 *
 * Excel on a machine with a comma decimal separator writes semicolons, and
 * "everything landed in one column" is an unhelpful way to discover that.
 */
function sniffDelimiter(text: string): ',' | ';' | '\t' {
  const head = text.slice(0, 4096);
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of head) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (inQuotes) continue;
    if (ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  const comma = counts[','] ?? 0;
  const semi = counts[';'] ?? 0;
  const tab = counts['\t'] ?? 0;
  if (semi > comma && semi >= tab) return ';';
  if (tab > comma && tab > semi) return '\t';
  return ',';
}

/**
 * Delimited text to a grid.
 *
 * Scans the whole text character by character rather than splitting it into
 * lines first. That is not a stylistic preference: a quoted cell may contain
 * newlines, and in these files it routinely does — a scoping answer is a
 * numbered list. Splitting on newlines before handling quotes shreds every one
 * of those into fragments and shifts every column after it, silently. The
 * import wizard's parser does exactly that, which is why this is a separate
 * implementation rather than a shared one.
 */
export function parseDelimited(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = sniffDelimiter(src);

  const grid: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    // A quote only opens a cell at its start. A stray quote mid-cell is text,
    // and treating it as an opening quote swallows the rest of the file.
    if (ch === '"' && cell.trim() === '') { cell = ''; inQuotes = true; continue; }
    if (ch === delimiter) { row.push(cell); cell = ''; continue; }
    if (ch === '\r') {
      if (src[i + 1] === '\n') i++;
      row.push(cell); grid.push(row); row = []; cell = '';
      continue;
    }
    if (ch === '\n') { row.push(cell); grid.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }

  // A file ending without a newline still has a last row; one ending with a
  // newline must not gain a phantom empty one.
  if (cell !== '' || row.length > 0) { row.push(cell); grid.push(row); }
  return grid;
}

/**
 * Tidies a cell without flattening it.
 *
 * The outer trim is what turns the single-space separator rows these sheets
 * carry into empty cells, so they drop out as blank rows a step later. It only
 * removes the first line's leading space and the last line's trailing one, so
 * the indentation inside a numbered answer — which is the structure of that
 * answer — survives.
 */
export function normaliseCell(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    // Non-breaking spaces read as spaces but defeat trim(), so a cell that is
    // one nbsp would survive as content and never drop out as a blank row.
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\t/g, '    ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A, B, ... Z, AA — the column as the person saw it in Excel. */
export function columnLabel(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

const NUMBERED = /^\d+(\.\d+)*[.)]?\s+\S/;
const INTERROGATIVE =
  /^(please|describe|list|provide|specify|what|which|how|why|who|whom|when|where|do you|does your|did you|are there|is there|are you|have you|can you)\b/i;

/**
 * Whether a question cell with an empty answer is a heading the client typed,
 * rather than a question they left blank.
 *
 * The order of the tests is load-bearing. "3. What is the nature of your
 * business?" starts with a number and would pass the numbering test, so the
 * question mark has to be checked first. That single ordering is the difference
 * between a handful of sections and one per question.
 */
export function looksLikeHeading(text: string): boolean {
  if (text === '' || text.length > 80) return false;
  if (text.includes('\n')) return false;
  if (text.endsWith('?')) return false;
  if (INTERROGATIVE.test(text)) return false;
  if (NUMBERED.test(text)) return true;
  if (text === text.toUpperCase() && /[A-Z]/.test(text)) return true;
  return text.split(/\s+/).length <= 6 && !/[.,;:]$/.test(text);
}

function detectColumns(
  rows: string[][],
  width: number
): { columns: { question: number; answer: number } | null; headerRow: number; guessed: boolean } {
  // (a) A labelled header row somewhere near the top. These files often carry
  //     a title and a blank line above the real header.
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    let q = -1;
    let a = -1;
    for (let c = 0; c < width; c++) {
      const k = headerKey(rows[r]![c] ?? '');
      if (q === -1 && QUESTION_HEADERS.has(k)) q = c;
      else if (a === -1 && ANSWER_HEADERS.has(k)) a = c;
    }
    if (q !== -1 && a !== -1) {
      return { columns: { question: q, answer: a }, headerRow: r, guessed: false };
    }
  }

  // (b) No labels — "Sr No | Area | Client Input" and friends. Score each
  //     ordered pair by how the columns behave: the question column is filled
  //     on nearly every row, the answer column is sparser and much longer and
  //     conventionally sits to its right. An ordinary sheet resolves to (0, 1);
  //     the scoring only earns its keep when there is a serial number in A.
  if (width < 2) return { columns: null, headerRow: -1, guessed: true };

  const fill: number[] = [];
  const meanLen: number[] = [];
  const questionish: number[] = [];
  for (let c = 0; c < width; c++) {
    const filled = rows.map((r) => r[c] ?? '').filter((v) => v !== '');
    fill[c] = filled.length / Math.max(rows.length, 1);
    meanLen[c] = filled.length === 0 ? 0 : filled.reduce((s, v) => s + v.length, 0) / filled.length;
    questionish[c] =
      filled.length === 0 ? 0 : filled.filter((v) => v.includes('?')).length / filled.length;
  }

  // A serial-number column is filled on every row and sits to the left of
  // everything, so fill and position alone score it exactly like a question
  // column and the tie goes to whichever came first. What actually separates
  // them is that a questionnaire asks questions: the question column carries
  // question marks and the index column carries "1", "2", "3". Both signals
  // are needed — a sheet of imperatives ("Describe your estate") has no
  // question marks either, and there the length floor is what rules the index
  // column out.
  const INDEX_COLUMN_MEAN_LEN = 15;

  let best: { question: number; answer: number } | null = null;
  let bestScore = -Infinity;
  for (let q = 0; q < width; q++) {
    for (let a = 0; a < width; a++) {
      if (a === q) continue;
      const score =
        fill[q]! * 2 +
        questionish[q]! * 3 +
        (meanLen[a]! > meanLen[q]! ? 1 : 0) +
        fill[a]! -
        (a < q ? 0.25 : 0) -
        (meanLen[q]! < INDEX_COLUMN_MEAN_LEN ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { question: q, answer: a };
      }
    }
  }
  return { columns: best, headerRow: -1, guessed: true };
}

/**
 * A grid of cells to the rows we store.
 *
 * `forced` re-runs the whole thing against columns the person picked, which is
 * why detection and extraction are one pure function rather than two: the
 * override costs a re-parse and no I/O, and is itself testable.
 */
export function parseScopingGrid(
  grid: string[][],
  forced?: { question: number; answer: number }
): ParsedScopingSheet {
  // 1. Normalise once. The single-space separator cells become empty here.
  const cells = grid.map((row) => row.map(normaliseCell));

  // 2. Trailing empty columns. A real export carries about twenty-five, because
  //    the sheet was once wider. Each would otherwise be an option in the
  //    column picker and a candidate in the scoring above.
  let width = 0;
  for (const row of cells) {
    for (let c = row.length - 1; c >= width; c--) {
      if (row[c] !== '') { width = c + 1; break; }
    }
  }

  // 3. Blank rows: hundreds at the end of a real file, plus the separators.
  const rows = cells
    .map((row) => Array.from({ length: width }, (_, c) => row[c] ?? ''))
    .filter((row) => row.some((v) => v !== ''));

  const dropped = cells.length - rows.length;
  const usedColumns = Array.from({ length: width }, (_, index) => ({
    index,
    label: columnLabel(index),
    sample: rows.find((r) => r[index] !== '')?.[index]?.slice(0, 60) ?? '',
  }));

  const detected = forced
    ? { columns: forced, headerRow: -1, guessed: false }
    : detectColumns(rows, width);

  if (!detected.columns) {
    return {
      rows: [], columns: null, guessed: true, usedColumns,
      dropped, unanswered: 0, truncated: false, sections: [],
    };
  }

  const { question: qc, answer: ac } = detected.columns;
  const out: ScopingRow[] = [];
  const sections: string[] = [];
  let section: string | null = null;
  let unanswered = 0;
  let truncated = false;

  for (let r = detected.headerRow + 1; r < rows.length; r++) {
    const q = rows[r]![qc] ?? '';
    const a = rows[r]![ac] ?? '';
    if (q === '' && a === '') continue;

    if (out.length >= MAX_SCOPING_ROWS) { truncated = true; break; }

    // A question cell with nothing beside it is either a heading the client
    // typed to organise the sheet, or a question they did not answer. Getting
    // it wrong shows either way: a heading rendered as an unanswered question
    // is noise, and a question swallowed as a heading is a lost fact.
    if (a === '' && looksLikeHeading(q)) {
      section = q.slice(0, MAX_SCOPING_SECTION_CHARS);
      if (!sections.includes(section)) sections.push(section);
      out.push({ section, question: section, answer: null, isSectionHeader: true });
      continue;
    }

    // An answer with no question belongs to the row above — a wrapped row in a
    // hand-edited sheet. Append it rather than invent a question for it.
    if (q === '') {
      const prev = out[out.length - 1];
      if (prev && !prev.isSectionHeader) {
        prev.answer = `${prev.answer ?? ''}\n${a}`.slice(0, MAX_SCOPING_ANSWER_CHARS);
      }
      continue;
    }

    // Kept, not dropped: "the client did not answer this" is exactly the sort
    // of thing worth seeing before committing hours to it.
    if (a === '') unanswered++;

    out.push({
      section,
      question: q.slice(0, MAX_SCOPING_QUESTION_CHARS),
      answer: a === '' ? null : a.slice(0, MAX_SCOPING_ANSWER_CHARS),
      isSectionHeader: false,
    });
  }

  return {
    rows: out,
    columns: detected.columns,
    guessed: detected.guessed,
    usedColumns,
    dropped,
    unanswered,
    truncated,
    sections,
  };
}

/** CSV text straight through to rows. */
export function parseScopingCsv(
  text: string,
  forced?: { question: number; answer: number }
): ParsedScopingSheet {
  return parseScopingGrid(parseDelimited(text), forced);
}

/**
 * The same total the router refines on, so the browser can refuse an oversized
 * sheet with a clear message rather than eating a 413.
 */
export function totalScopingChars(rows: ScopingRow[]): number {
  return rows.reduce(
    (n, r) => n + r.question.length + (r.answer?.length ?? 0) + (r.section?.length ?? 0),
    0
  );
}

/** How many rows are real questions, ignoring the headings between them. */
export function countQuestions(rows: ScopingRow[]): number {
  return rows.filter((r) => !r.isSectionHeader).length;
}

export type SheetEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

/**
 * Which bytes these are.
 *
 * `FileReader.readAsText` assumes UTF-8 and has no strict mode: it substitutes
 * U+FFFD silently, and once it has done that the information is gone. So the
 * decision is made on bytes, before anything decodes — the sheets that arrive
 * here are routinely saved by Excel on Windows as CSV, which is cp1252, and
 * reading those as UTF-8 is what turns an apostrophe into `í`.
 *
 * Repairing that afterwards would be the wrong fix. The mangling is a decode
 * taken wrongly, not a corruption to be healed, and "re-encode to latin-1 and
 * try again" damages text that legitimately contains those characters. There is
 * one chance to get it right and it is here.
 */
export function decodeSheetBytes(buffer: ArrayBuffer | Uint8Array): {
  text: string;
  encoding: SheetEncoding;
} {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  }

  try {
    // UTF-8 is self-validating: its multi-byte structure means cp1252 prose
    // carrying any accented byte throws here, which is exactly the
    // discrimination wanted. A cp1252 file that is pure ASCII decodes fine and
    // is byte-identical either way, so misfiling that one costs nothing.
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}
