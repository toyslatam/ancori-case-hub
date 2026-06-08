import * as XLSX from 'xlsx';

export type ExcelColumn = { key: string; label: string };

export function exportToExcel(
  rows: Array<Record<string, string | number | null | undefined>>,
  columns: ExcelColumn[],
  filename: string,
  sheetName = 'Datos',
) {
  // Construir datos: primera fila = encabezados
  const header = columns.map(c => c.label);
  const data = rows.map(row =>
    columns.map(c => row[c.key] ?? ''),
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  // Ancho automático por columna
  const colWidths = columns.map((c, i) => ({
    wch: Math.max(
      c.label.length,
      ...data.map(row => String(row[i] ?? '').length),
    ) + 2,
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const xlsxName = filename.replace(/\.(csv|xlsx?)$/i, '') + '.xlsx';
  XLSX.writeFile(wb, xlsxName);
}
