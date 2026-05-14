function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function forceSpreadsheetText(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `="${escaped}"`;
}

export function exportToCSV(
  rows: Record<string, unknown>[],
  filename: string,
  options?: { forceTextColumns?: string[] }
) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]!);
  const forceText = new Set(options?.forceTextColumns ?? []);
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (forceText.has(h)) {
          return forceSpreadsheetText(str);
        }
        return escapeCsvCell(str);
      }).join(',')
    ),
  ];

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
