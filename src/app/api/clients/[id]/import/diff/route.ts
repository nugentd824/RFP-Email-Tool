import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import type { ImportDiff, ImportRow } from "@/lib/types";

const FIELDS: (keyof ImportRow)[] = ["company", "firstName", "lastName", "title", "category", "notes"];

// Compares cleaned import rows against existing contacts (matched on email,
// case-insensitive). Explicit duplicates (duplicateOfId set) are skipped so
// the primary record wins. Audience assignments are never part of the diff.
export const POST = guarded(async (req, params) => {
  const { rows } = (await req.json()) as { rows: ImportRow[] };
  if (!Array.isArray(rows)) throw new ApiError(400, "Missing rows");

  const existing = await prisma.contact.findMany({
    where: { clientId: params.id, duplicateOfId: null },
  });
  const byEmail = new Map(existing.map((c) => [c.email.toLowerCase(), c]));

  const diff: ImportDiff = { news: [], changed: [], unchangedCount: 0 };
  for (const row of rows) {
    const match = byEmail.get(row.email.trim().toLowerCase());
    if (!match) {
      diff.news.push(row);
      continue;
    }
    const changedFields = FIELDS.filter((f) => (row[f] ?? "").trim() !== (match[f] ?? "").trim());
    if (changedFields.length === 0) {
      diff.unchangedCount++;
    } else {
      diff.changed.push({
        contactId: match.id,
        email: match.email,
        existing: {
          company: match.company,
          firstName: match.firstName,
          lastName: match.lastName,
          email: match.email,
          title: match.title,
          category: match.category,
          notes: match.notes,
        },
        incoming: row,
        fields: changedFields,
      });
    }
  }
  return NextResponse.json(diff);
});
