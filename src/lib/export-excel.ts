import * as XLSX from "xlsx";

interface ExportOptions {
  data: Record<string, unknown>[];
  headers: { key: string; label: string; format?: "currency" | "number" }[];
  sheetName: string;
  fileName: string;
  title?: string;
  totalRow?: boolean;
}

/** Generate and download an Excel file from data */
export function exportToExcel({
  data,
  headers,
  sheetName,
  fileName,
  title,
  totalRow,
}: ExportOptions) {
  const rows: unknown[][] = [];

  // Company header
  if (title) {
    rows.push([title]);
    rows.push(["TOP KIM OIL SDN. BHD."]);
    rows.push([]);
  }

  // Column headers
  rows.push(headers.map((h) => h.label));

  // Data rows
  for (const row of data) {
    rows.push(
      headers.map((h) => {
        const val = row[h.key];
        if (val === null || val === undefined) return "";
        return val;
      })
    );
  }

  // Total row
  if (totalRow && data.length > 0) {
    const totals: unknown[] = headers.map((h, i) => {
      if (i === 0) return "TOTAL";
      if (h.format === "currency" || h.format === "number") {
        return data.reduce((s: number, r) => s + (Number(r[h.key]) || 0), 0);
      }
      return "";
    });
    rows.push(totals);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Auto-column width
  const colWidths = headers.map((h, i) => {
    let max = h.label.length;
    for (const row of rows) {
      const val = String(row[i] ?? "");
      if (val.length > max) max = val.length;
    }
    return { wch: Math.min(max + 2, 30) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

/** Generate a multi-sheet Excel workbook */
export function exportMultiSheet(
  sheets: {
    name: string;
    data: Record<string, unknown>[];
    headers: { key: string; label: string; format?: "currency" | "number" }[];
    title?: string;
    totalRow?: boolean;
  }[],
  fileName: string
) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const rows: unknown[][] = [];

    if (sheet.title) {
      rows.push([sheet.title]);
      rows.push(["TOP KIM OIL SDN. BHD."]);
      rows.push([]);
    }

    rows.push(sheet.headers.map((h) => h.label));

    for (const row of sheet.data) {
      rows.push(
        sheet.headers.map((h) => {
          const val = row[h.key];
          if (val === null || val === undefined) return "";
          return val;
        })
      );
    }

    if (sheet.totalRow && sheet.data.length > 0) {
      const totals: unknown[] = sheet.headers.map((h, i) => {
        if (i === 0) return "TOTAL";
        if (h.format === "currency" || h.format === "number") {
          return sheet.data.reduce((s: number, r) => s + (Number(r[h.key]) || 0), 0);
        }
        return "";
      });
      rows.push(totals);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const colWidths = sheet.headers.map((h, i) => {
      let max = h.label.length;
      for (const row of rows) {
        const val = String(row[i] ?? "");
        if (val.length > max) max = val.length;
      }
      return { wch: Math.min(max + 2, 30) };
    });
    ws["!cols"] = colWidths;

    // Sanitize sheet name (max 31 chars, no special chars)
    const safeName = sheet.name.replace(/[\\/*?[\]:]/g, "").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
