import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded } from "@/lib/api";
import type { TemplateSource } from "@/lib/types";

// All non-empty templates across all clients, for the "copy template from
// another client" picker.
export const GET = guarded(async () => {
  const templates = await prisma.template.findMany({
    where: { OR: [{ subject: { not: "" } }, { bodyHtml: { not: "" } }] },
    include: {
      audience: { include: { client: true } },
      attachments: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const sources: TemplateSource[] = templates.map((t) => ({
    audienceId: t.audienceId,
    clientName: t.audience.client.name,
    engagement: t.audience.client.engagement,
    audienceLabel: t.audience.label,
    subject: t.subject,
    version: t.version,
    attachmentCount: t.attachments.length,
    updatedAt: t.updatedAt.toISOString(),
  }));
  return NextResponse.json(sources);
});
