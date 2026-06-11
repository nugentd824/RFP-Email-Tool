"use client";

// Client-side Excel/CSV parsing and export (SheetJS). Files are parsed in the
// browser so the mapping/preview wizard never uploads the raw spreadsheet.
import * as XLSX from "xlsx";
import type { ImportRow } from "./types";

export type FieldKey = keyof ImportRow;

export const FIELD_DEFS: { key: FieldKey; label: string; required: boolean }[] = [
  { key: "email", label: "Email Address", required: true },
  { key: "company", label: "Supplier Company Name", required: false },
  { key: "firstName", label: "Contact First Name", required: false },
  { key: "lastName", label: "Contact Last Name", required: false },
  { key: "title", label: "Title", required: false },
  { key: "category", label: "Category / Commodity", required: false },
  { key: "notes", label: "Notes", required: false },
];

const SYNONYMS: Record<FieldKey, string[]> = {
  email: ["email", "emailaddress", "contactemail", "mail", "emailid"],
  firstName: ["firstname", "contactfirstname", "first", "fname", "givenname"],
  lastName: ["lastname", "contactlastname", "last", "lname", "surname", "familyname"],
  company: [
    "suppliercompanyname", "suppliercompany", "suppliername", "supplier", "companyname",
    "company", "vendorname", "vendor", "organization", "organisation", "business",
  ],
  title: ["title", "jobtitle", "position", "role"],
  category: ["categorycommodity", "category", "commodity", "segment", "producttype"],
  notes: ["notes", "note", "comments", "comment", "remarks"],
};

export type ParsedWorkbook = { sheetNames: string[]; grids: Record<string, string[][]> };

export async function readWorkbook(file: File): Promise<ParsedWorkbook> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const grids: Record<string, string[][]> = {};
  for (const name of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    // Normalize every cell to a trimmed string; drop fully-empty rows
    // (trailing blanks, separator rows) and trailing empty columns.
    const grid = raw
      .map((row) => row.map((cell) => String(cell ?? "").trim()))
      .filter((row) => row.some((cell) => cell !== ""));
    const width = Math.max(0, ...grid.map((r) => r.reduce((w, c, i) => (c ? i + 1 : w), 0)));
    grids[name] = grid.map((r) => {
      const out = r.slice(0, width);
      while (out.length < width) out.push("");
      return out;
    });
  }
  return { sheetNames: wb.SheetNames, grids };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Files often arrive with banner/title rows above the real header (merged
// cells land in row 1). Score the first rows and pick the most header-like.
export function guessHeaderRowIndex(grid: string[][]): number {
  const all = Object.values(SYNONYMS).flat();
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const cells = grid[i].map(norm);
    const keywordHits = cells.filter((c) => c && all.some((s) => c === s || c.includes(s))).length;
    const nonEmpty = cells.filter(Boolean).length;
    const score = keywordHits * 10 + nonEmpty;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export function guessMapping(headerCells: string[]): Record<FieldKey, number> {
  const normed = headerCells.map(norm);
  const used = new Set<number>();
  const mapping = {} as Record<FieldKey, number>;
  for (const { key } of FIELD_DEFS) {
    let found = -1;
    // exact synonym match first, then substring
    for (const syn of SYNONYMS[key]) {
      const i = normed.findIndex((h, idx) => !used.has(idx) && h === syn);
      if (i >= 0) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      for (const syn of SYNONYMS[key]) {
        const i = normed.findIndex((h, idx) => !used.has(idx) && h !== "" && h.includes(syn));
        if (i >= 0) {
          found = i;
          break;
        }
      }
    }
    mapping[key] = found;
    if (found >= 0) used.add(found);
  }
  return mapping;
}

export function rowsFromGrid(
  grid: string[][],
  headerRowIndex: number,
  mapping: Record<FieldKey, number>
): ImportRow[] {
  const rows: ImportRow[] = [];
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const get = (key: FieldKey) => (mapping[key] >= 0 ? (grid[i][mapping[key]] ?? "").trim() : "");
    const row: ImportRow = {
      company: get("company"),
      firstName: get("firstName"),
      lastName: get("lastName"),
      email: get("email"),
      title: get("title"),
      category: get("category"),
      notes: get("notes"),
    };
    if (Object.values(row).every((v) => v === "")) continue;
    rows.push(row);
  }
  return rows;
}

export function exportXlsx(
  fileName: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}

export function exportCsv(fileName: string, headers: string[], rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
