import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import { isValidEmail } from "@/lib/format";
import type { ImportRow } from "@/lib/types";

// Applies an approved import: creates new contacts and updates changed ones.
// Updates never touch audienceId, so existing assignments survive re-imports.
export const POST = guarded(async (req, params) => {
  const { creates, updates } = (await req.json()) as {
    creates: ImportRow[];
    updates: { contactId: string; row: ImportRow }[];
  };
  if (!Array.isArray(creates) || !Array.isArray(updates))
    throw new ApiError(400, "Malformed import payload");

  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) throw new ApiError(404, "Client not found");

  await prisma.$transaction([
    prisma.contact.createMany({
      data: creates.map((row) => ({
        clientId: params.id,
        company: row.company.trim(),
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        email: row.email.trim(),
        title: row.title.trim(),
        category: row.category.trim(),
        notes: row.notes,
        emailValid: isValidEmail(row.email),
      })),
    }),
    ...updates.map((u) =>
      prisma.contact.update({
        where: { id: u.contactId },
        data: {
          company: u.row.company.trim(),
          firstName: u.row.firstName.trim(),
          lastName: u.row.lastName.trim(),
          title: u.row.title.trim(),
          category: u.row.category.trim(),
          notes: u.row.notes,
        },
      })
    ),
  ]);
  return NextResponse.json({ created: creates.length, updated: updates.length });
});
