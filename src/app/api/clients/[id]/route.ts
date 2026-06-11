import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import { sentPairs, deriveSendStatus } from "@/lib/aggregate";
import type { ClientDetail } from "@/lib/types";

export const GET = guarded(async (_req, params) => {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      audiences: {
        orderBy: { key: "asc" },
        include: {
          template: {
            include: {
              attachments: {
                select: { id: true, fileName: true, mimeType: true, size: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
    },
  });
  if (!client) throw new ApiError(404, "Client not found");

  const [contacts, sent] = await Promise.all([
    prisma.contact.findMany({
      where: { clientId: client.id },
      select: { id: true, audienceId: true },
    }),
    sentPairs(client.id),
  ]);

  const detail: ClientDetail = {
    id: client.id,
    name: client.name,
    engagement: client.engagement,
    notes: client.notes,
    status: client.status as ClientDetail["status"],
    audiences: client.audiences.map((a) => {
      const assigned = contacts.filter((ct) => ct.audienceId === a.id);
      const sentCount = assigned.filter((ct) => sent.has(`${ct.id}|${a.id}`)).length;
      const t = a.template!;
      return {
        id: a.id,
        key: a.key,
        label: a.label,
        targetSendDate: a.targetSendDate,
        bccEmails: a.bccEmails,
        assignedCount: assigned.length,
        sentCount,
        sendStatus: deriveSendStatus(assigned.length, sentCount),
        template: {
          id: t.id,
          subject: t.subject,
          bodyHtml: t.bodyHtml,
          version: t.version,
          noAttachmentConfirmed: t.noAttachmentConfirmed,
          updatedAt: t.updatedAt.toISOString(),
          attachments: t.attachments,
        },
      };
    }),
  };
  return NextResponse.json(detail);
});

export const PATCH = guarded(async (req, params) => {
  const body = await req.json();
  const data: Record<string, string> = {};
  for (const k of ["name", "engagement", "notes", "status"] as const) {
    if (typeof body[k] === "string") data[k] = body[k];
  }
  if (data.status && !["SETUP", "IN_PROGRESS", "COMPLETE"].includes(data.status))
    throw new ApiError(400, "Invalid status");
  if (data.name !== undefined && !data.name.trim())
    throw new ApiError(400, "Client name cannot be empty");
  await prisma.client.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
});

export const DELETE = guarded(async (_req, params) => {
  await prisma.client.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
