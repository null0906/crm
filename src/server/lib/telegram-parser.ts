/**
 * Pure, side-effect-free parser for structured Telegram bot messages.
 *
 * Message format:
 *   /command
 *   key: value
 *   key: value with: colons
 *
 * For /find: single argument on the same line as the command.
 * For /today, /mytasks, /help, /start: no arguments.
 */

export interface ParsedMessage {
  command: string;
  /** Single search term (only for /find) */
  searchArg?: string;
  fields: Record<string, string>;
  errors: string[];
}

/**
 * Parse a raw Telegram message into a structured command + fields.
 */
export function parseStructuredMessage(rawText: string): ParsedMessage {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { command: '', fields: {}, errors: ['Empty message'] };
  }

  const firstLine = lines[0]!;
  const commandMatch = firstLine.match(/^(\/\w+)(?:\s+(.*))?$/);

  if (!commandMatch) {
    return { command: '', fields: {}, errors: ['First line must be a /command'] };
  }

  const command = commandMatch[1]!.toLowerCase();
  const inlineArg = commandMatch[2]?.trim() ?? '';
  const noArgCommands = ['/today', '/mytasks', '/help', '/start'];

  if (noArgCommands.includes(command)) {
    return { command, fields: {}, errors: [] };
  }

  if (command === '/find') {
    const term = inlineArg || lines.slice(1).join(' ').trim();
    if (!term) {
      return { command, fields: {}, errors: ['Missing search term after /find'] };
    }
    return { command, searchArg: term, fields: {}, errors: [] };
  }

  // General key:value parsing for remaining commands
  const fields: Record<string, string> = {};
  const errors: string[] = [];
  const bodyLines = lines.slice(1);

  for (const line of bodyLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      errors.push(`Line "${line}" has no colon — expected "key: value" format`);
      continue;
    }

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (!key) {
      errors.push(`Empty key in line "${line}"`);
      continue;
    }

    if (!value) {
      // Skip empty values silently
      continue;
    }

    fields[key] = value;
  }

  return { command, fields, errors };
}

/**
 * Parse "First Last" or "First" into { firstName, lastName }.
 * Handles extra whitespace and multi-word last names (e.g. "Mary De Souza").
 */
export function parseName(nameStr: string): { firstName: string; lastName: string } {
  const parts = nameStr.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) {
    return { firstName: '', lastName: '' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Parse a comma/semicolon separated tag string into an array of trimmed tags.
 * Ignores empty segments.
 */
export function parseTags(tagStr: string): string[] {
  return tagStr
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Clean a phone number string — strip spaces, dashes, dots, parentheses.
 * Keeps leading + for international format.
 */
export function parsePhone(phoneStr: string): string {
  return phoneStr.replace(/[\s\-().]/g, '');
}

/**
 * Basic email validation.
 */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Normalize a domain — lowercase, strip protocol, strip trailing slash and www.
 * e.g. "https://www.Example.com/" → "example.com"
 */
export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}
