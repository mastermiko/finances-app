/**
 * Protection against formula injection (CSV/XLSX opened in a spreadsheet):
 * text starting with = + - @ (or tab / carriage return, per OWASP) is prefixed with '.
 */
const DANGEROUS_START = /^[=+\-@\t\r]/;

export function needsFormulaEscape(value: string): boolean {
  return DANGEROUS_START.test(value);
}

export function escapeFormula(value: string): string {
  return needsFormulaEscape(value) ? `'${value}` : value;
}
