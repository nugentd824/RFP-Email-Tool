import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import { sentPairs, deriveSendStatus } from "@/lib/aggregate";
import type { ClientSummary } from "@/lib/types";

export const GET = guarded(async () => {
  const [clients, contacts, sent] = await Promise.all([
    prisma.client.findMany({
      orderBy: { createdAt: "desc" },
      include: { audiences: { orderBy: { key: "asc" } } },
    }),
    prisma.contact.findMany({ select: { id: true, clientId: true, audienceId: true } }),
    sentPairs(),
  ]);

  const summaries: ClientSummary[] = clients.map((c) => {
    const mine = contacts.filter((ct) => ct.clientId === c.id);
    const audiences = c.audiences.map((a) => {
      const assigned = mine.filter((ct) => ct.audienceId === a.id);
      const sentCount = assigned.filter((ct) => sent.has(`${ct.id}|${a.id}`)).length;
      return {
        id: a.id,
        key: a.key,
        label: a.label,
        targetSendDate: a.targetSendDate,
        assignedCount: assigned.length,
        sentCount,
        sendStatus: deriveSendStatus(assigned.length, sentCount),
      };
    });
    const assignedTotal = mine.filter((ct) => ct.audienceId !== null).length;
    return {
      id: c.id,
      name: c.name,
      engagement: c.engagement,
      status: c.status as ClientSummary["status"],
      totalContacts: mine.length,
      assignedContacts: assignedTotal,
      unassignedContacts: mine.length - assignedTotal,
      audiences,
    };
  });

  return NextResponse.json(summaries);
});

export const POST = guarded(async (req) => {
  const body = await req.json();
  const name = (body.name ?? "").trim();
  if (!name) throw new ApiError(400, "Client name is required");

  const client = await prisma.client.create({
    data: {
      name,
      engagement: (body.engagement ?? "").trim(),
      notes: body.notes ?? "",
      audiences: {
        create: [
          { key: "A", label: "Audience A", template: { create: {} } },
          { key: "B", label: "Audience B", template: { create: {} } },
        ],
      },
    },
  });
  return NextResponse.json({ id: client.id }, { status: 201 });
});
