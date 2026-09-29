import { describe, expect, it } from 'vitest';
import {
  columnLabel,
  countQuestions,
  decodeSheetBytes,
  looksLikeHeading,
  MAX_SCOPING_ROWS,
  normaliseCell,
  parseDelimited,
  parseScopingCsv,
  parseScopingGrid,
  totalScopingChars,
} from './scoping-sheet';

/**
 * The shape of a real returned questionnaire, reduced but not simplified.
 *
 * Every awkward thing in here is copied from an actual client file: the
 * trailing empty columns, the numbered section rows with nothing beside them,
 * the separator row that is a single space, and above all the multi-line
 * answer. The last one is why this parser exists at all.
 */
const REAL_SHEET = [
  'Questions,Response,,,,',
  '1. Organization Overview, ,,,,',
  'What is the nature of your business and what services/products do you offer?,"1. Digital Loan Aggregation',
  '                Connecting dealers and customers with multiple banks/NBFCs.',
  '2. RC and PDD Management',
  '                Automated collection and tracking of Registration Certificates.",,,,',
  'Are you part of a larger group or parent company?,Madhyani Group,,,,',
  ' ,,,,,',
  '2. Scope Definition,,,,,',
  '"What specific departments, locations, or business units do you want to include?",All,,,,',
  'Do you operate in multiple countries or regions?,"No, only in India",,,,',
  'Have you conducted any risk assessments or third-party audits in the past?,,,,,',
  ',,,,,',
  ',,,,,',
].join('\n');

describe('parseDelimited', () => {
  it('keeps a quoted cell containing newlines as one cell', () => {
    const grid = parseDelimited('a,"line one\nline two",c');
    expect(grid).toHaveLength(1);
    expect(grid[0]).toEqual(['a', 'line one\nline two', 'c']);
  });

  it('parses CRLF identically to LF', () => {
    expect(parseDelimited('a,b\r\nc,d')).toEqual(parseDelimited('a,b\nc,d'));
  });

  it('unescapes a doubled quote inside a quoted cell', () => {
    expect(parseDelimited('"he said ""hi""",b')[0]).toEqual(['he said "hi"', 'b']);
  });

  it('treats a quote that is not at the start of a cell as text', () => {
    // Otherwise one stray quote swallows the remainder of the file.
    const grid = parseDelimited('say "hi",b\nnext,row');
    expect(grid).toHaveLength(2);
    expect(grid[0]![0]).toBe('say "hi"');
  });

  it('strips a UTF-8 BOM from the first header', () => {
    expect(parseDelimited('﻿Questions,Response')[0]![0]).toBe('Questions');
  });

  it('does not invent a trailing row for a file ending in a newline', () => {
    expect(parseDelimited('a,b\n')).toHaveLength(1);
  });

  it('reads a semicolon-delimited export', () => {
    expect(parseDelimited('Questions;Response\nWhat?;Yes')[1]).toEqual(['What?', 'Yes']);
  });

  it('reads a tab-delimited export', () => {
    expect(parseDelimited('Questions\tResponse\nWhat?\tYes')[1]).toEqual(['What?', 'Yes']);
  });
});

describe('normaliseCell', () => {
  it('reduces a single-space separator cell to empty', () => {
    expect(normaliseCell(' ')).toBe('');
  });

  it('reduces a non-breaking-space cell to empty', () => {
    expect(normaliseCell(String.fromCharCode(160))).toBe('');
  });

  it('keeps the indentation inside a multi-line answer', () => {
    const out = normaliseCell('1. First\n    Indented detail\n2. Second');
    expect(out).toBe('1. First\n    Indented detail\n2. Second');
  });
});

describe('looksLikeHeading', () => {
  it('accepts a numbered heading', () => {
    expect(looksLikeHeading('1. Organization Overview')).toBe(true);
    expect(looksLikeHeading('3. Legal, Regulatory, and Contractual Requirements')).toBe(true);
  });

  it('accepts an all-caps heading', () => {
    expect(looksLikeHeading('SCOPE DEFINITION')).toBe(true);
  });

  it('accepts a short title-cased heading', () => {
    expect(looksLikeHeading('Scope Definition')).toBe(true);
  });

  it('rejects a numbered question, because the question mark wins', () => {
    // The ordering of the checks is the whole point: this passes the numbering
    // test and must still not be a heading.
    expect(looksLikeHeading('3. What is the nature of your business?')).toBe(false);
  });

  it('rejects an unanswered imperative question with no question mark', () => {
    expect(looksLikeHeading('Describe your critical business processes')).toBe(false);
    expect(looksLikeHeading('Are you part of a larger group')).toBe(false);
  });

  it('rejects long prose', () => {
    expect(looksLikeHeading('a'.repeat(90))).toBe(false);
  });
});

describe('parseScopingGrid on a real sheet', () => {
  const parsed = parseScopingCsv(REAL_SHEET);

  it('finds the labelled columns without guessing', () => {
    expect(parsed.columns).toEqual({ question: 0, answer: 1 });
    expect(parsed.guessed).toBe(false);
  });

  it('trims the trailing empty columns', () => {
    expect(parsed.usedColumns).toHaveLength(2);
    expect(parsed.usedColumns.map((c) => c.label)).toEqual(['A', 'B']);
  });

  it('reads the two numbered rows as sections', () => {
    expect(parsed.sections).toEqual(['1. Organization Overview', '2. Scope Definition']);
  });

  it('keeps the multi-line answer whole, with its line breaks', () => {
    const q = parsed.rows.find((r) => r.question.startsWith('What is the nature'));
    expect(q).toBeDefined();
    expect(q!.answer).toContain('1. Digital Loan Aggregation');
    expect(q!.answer).toContain('2. RC and PDD Management');
    expect(q!.answer!.split('\n').length).toBeGreaterThan(1);
  });

  it('carries the heading down onto the questions beneath it', () => {
    const q = parsed.rows.find((r) => r.question.startsWith('Do you operate'));
    expect(q!.section).toBe('2. Scope Definition');
  });

  it('keeps an unanswered question rather than dropping it', () => {
    const q = parsed.rows.find((r) => r.question.startsWith('Have you conducted'));
    expect(q).toBeDefined();
    expect(q!.answer).toBeNull();
    expect(q!.isSectionHeader).toBe(false);
    expect(parsed.unanswered).toBe(1);
  });

  it('does not let the comma inside a quoted answer split the cell', () => {
    const q = parsed.rows.find((r) => r.question.startsWith('Do you operate'));
    expect(q!.answer).toBe('No, only in India');
  });

  it('counts the blank and separator rows it dropped', () => {
    expect(parsed.dropped).toBeGreaterThan(0);
  });

  it('reports five questions beside the two headings', () => {
    // Five, not four: the unanswered risk-assessment row is still a question.
    expect(countQuestions(parsed.rows)).toBe(5);
    expect(parsed.rows.filter((r) => r.isSectionHeader)).toHaveLength(2);
  });

  it('gives every stored heading a null answer, as the CHECK requires', () => {
    for (const row of parsed.rows.filter((r) => r.isSectionHeader)) {
      expect(row.answer).toBeNull();
    }
  });
});

describe('column detection', () => {
  it('matches singular and differently-cased headers', () => {
    expect(parseScopingCsv('question,answer\nWhat?,Yes').columns).toEqual({
      question: 0,
      answer: 1,
    });
    expect(parseScopingCsv(' Questions , Responses \nWhat?,Yes').columns).toEqual({
      question: 0,
      answer: 1,
    });
  });

  it('recognises the wider label vocabulary past a serial-number column', () => {
    const csv = [
      'Sr No,Area,Client Input',
      '1,Do you use a central identity system?,Google Workspace across the whole organisation',
      '2,Are you hosted on-premises or in the cloud?,Cloud only — Azure App Services',
    ].join('\n');
    const parsed = parseScopingCsv(csv);
    // Resolved by name rather than by shape, even with a serial number in A.
    expect(parsed.guessed).toBe(false);
    expect(parsed.columns).toEqual({ question: 1, answer: 2 });
  });

  it('falls back to shape when no header is recognisable at all', () => {
    const csv = [
      'Sr No,Point raised,Notes returned by them',
      '1,Do you use a central identity system?,Google Workspace across the whole organisation',
      '2,Are you hosted on-premises or in the cloud?,Cloud only - Azure App Services running PHP',
      '3,How many staff are in scope?,About forty people across two offices in Raipur',
    ].join('\n');
    const parsed = parseScopingCsv(csv);
    expect(parsed.guessed).toBe(true);
    // The question column is filled on every row; the answer column is longer.
    expect(parsed.columns).toEqual({ question: 1, answer: 2 });
  });

  it('gives up rather than guessing when there is only one column', () => {
    const parsed = parseScopingCsv('Just one column\nand a value');
    expect(parsed.columns).toBeNull();
    expect(parsed.rows).toEqual([]);
  });

  it('honours a forced column override', () => {
    // The picker hands back indices; the same pure function re-runs with them.
    const parsed = parseScopingCsv('Questions,Response\nWhat?,Yes', { question: 1, answer: 0 });
    expect(parsed.columns).toEqual({ question: 1, answer: 0 });
    expect(parsed.rows[0]).toMatchObject({ question: 'Response', answer: 'Questions' });
  });
});

describe('caps', () => {
  it('truncates past the row cap and says so', () => {
    const rows = ['Questions,Response'];
    for (let i = 0; i < MAX_SCOPING_ROWS + 20; i++) rows.push(`Question ${i}?,Answer ${i}`);
    const parsed = parseScopingCsv(rows.join('\n'));
    expect(parsed.truncated).toBe(true);
    expect(parsed.rows).toHaveLength(MAX_SCOPING_ROWS);
  });

  it('sums question, answer and section for the size guard', () => {
    const total = totalScopingChars([
      { section: 'ab', question: 'cde', answer: 'fghi', isSectionHeader: false },
      { section: null, question: 'x', answer: null, isSectionHeader: false },
    ]);
    expect(total).toBe(2 + 3 + 4 + 1);
  });
});

describe('decodeSheetBytes', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);

  it('decodes plain UTF-8', () => {
    const utf8 = new TextEncoder().encode('Questions,Response');
    expect(decodeSheetBytes(utf8)).toEqual({ text: 'Questions,Response', encoding: 'utf-8' });
  });

  it('strips a UTF-8 BOM and reports utf-8', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Questions')]);
    expect(decodeSheetBytes(withBom)).toEqual({ text: 'Questions', encoding: 'utf-8' });
  });

  it('reads Excel-on-Windows cp1252 as an apostrophe, not as mojibake', () => {
    // 0x92 is the cp1252 right single quote. Read as UTF-8 this is the `íve`
    // that shows up in real client files.
    const out = decodeSheetBytes(bytes(0x79, 0x6f, 0x75, 0x92, 0x76, 0x65));
    expect(out.encoding).toBe('windows-1252');
    expect(out.text).toBe('you’ve');
    expect(out.text).not.toContain('í');
  });

  it('handles a UTF-16LE BOM', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x51, 0x00, 0x75, 0x00]);
    expect(decodeSheetBytes(utf16)).toEqual({ text: 'Qu', encoding: 'utf-16le' });
  });

  it('keeps real UTF-8 accents rather than mangling them into cp1252', () => {
    const utf8 = new TextEncoder().encode('Sécurité, día');
    expect(decodeSheetBytes(utf8)).toEqual({ text: 'Sécurité, día', encoding: 'utf-8' });
  });
});

describe('columnLabel', () => {
  it('numbers columns the way a spreadsheet does', () => {
    expect(columnLabel(0)).toBe('A');
    expect(columnLabel(25)).toBe('Z');
    expect(columnLabel(26)).toBe('AA');
  });
});

describe('parseScopingGrid on an xlsx-shaped grid', () => {
  it('reads a grid straight, without going through the CSV scanner', () => {
    const parsed = parseScopingGrid([
      ['Questions', 'Response', '', ''],
      ['1. Organization Overview', '', '', ''],
      ['How many staff work in IT and security?', 'IT - 6, Security - 2', '', ''],
      ['', '', '', ''],
    ]);
    expect(parsed.columns).toEqual({ question: 0, answer: 1 });
    expect(countQuestions(parsed.rows)).toBe(1);
    expect(parsed.rows[1]!.answer).toBe('IT - 6, Security - 2');
    expect(parsed.rows[1]!.section).toBe('1. Organization Overview');
  });
});
