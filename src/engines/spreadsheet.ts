import type { ConvertJobResult } from "../core/types";
import { replaceExt } from "../core/registry";
import { parseStructured, stringifyStructured } from "./text";

export async function convertXlsxToText(
  bytes: Uint8Array,
  fileName: string,
  targetFormat: string,
): Promise<ConvertJobResult> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.slice().buffer);

  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Workbook contains no worksheets");

  const headers: string[] = [];
  const rows: Record<string, unknown>[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const vals = row.values as unknown[];
    // exceljs row.values is 1-indexed (vals[0] is undefined)
    if (rowNumber === 1) {
      for (let i = 1; i < vals.length; i++) {
        headers.push(String(vals[i] ?? `col_${i}`));
      }
      return;
    }

    const obj: Record<string, unknown> = {};
    for (let i = 1; i <= headers.length; i++) {
      const key = headers[i - 1] || `col_${i}`;
      const cell = vals[i];
      obj[key] =
        cell && typeof cell === "object" && "result" in cell
          ? (cell as { result: unknown }).result
          : cell && typeof cell === "object" && "text" in cell
            ? (cell as { text: unknown }).text
            : (cell ?? null);
    }
    rows.push(obj);
  });

  const out = stringifyStructured(rows, targetFormat);
  return {
    outputName: replaceExt(fileName, out.ext),
    mime: out.mime,
    bytes: new TextEncoder().encode(out.text),
    meta: { rows: rows.length, sheet: sheet.name },
  };
}

export async function convertTextToXlsx(
  bytes: Uint8Array,
  fileName: string,
  sourceFormat: string,
): Promise<ConvertJobResult> {
  const raw = new TextDecoder("utf-8").decode(bytes);
  const parsed = parseStructured(raw, sourceFormat);
  const rows = Array.isArray(parsed) ? parsed : [parsed];

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");

  if (rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null) {
    const keys = Array.from(
      new Set(rows.flatMap((r) => (r && typeof r === "object" ? Object.keys(r as Record<string, unknown>) : []))),
    );
    sheet.addRow(keys);
    for (const r of rows) {
      const rec = (r ?? {}) as Record<string, unknown>;
      sheet.addRow(keys.map((k) => (rec[k] === undefined ? null : rec[k])));
    }
  } else {
    for (const r of rows) {
      sheet.addRow([r]);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return {
    outputName: replaceExt(fileName, "xlsx"),
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: new Uint8Array(buf),
    meta: { rows: rows.length },
  };
}
