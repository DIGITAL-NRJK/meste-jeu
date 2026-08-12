export type CsvValue = string | number | boolean | null | undefined;

function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/u.test(text)) {
    text = `'${text}`;
  }

  if (/[;"\r\n]/u.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function createCsvDocument(rows: CsvValue[][]): string {
  return `\uFEFF${rows
    .map((row) => row.map(escapeCsvValue).join(";"))
    .join("\r\n")}\r\n`;
}
