type Cell = string | number | null | undefined;

export function billingCsv(rows: Cell[][]): string {
  const cell = (value: Cell) => {
    if (typeof value === 'number') return String(value);
    const text = value ?? '';
    // Spreadsheet apps can evaluate cells as formulas even when the CSV field was quoted.
    const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
