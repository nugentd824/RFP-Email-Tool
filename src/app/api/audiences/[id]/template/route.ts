import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";

export const PUT = guarded(async (req, params) => {
  const body = await req.json();
  const template = await prisma.template.findUnique({ where: { audienceId: params.id } });
  if (!template) throw new ApiError(404, "Template not found");

  const subject = typeof body.subject === "string" ? body.subject : template.subject;
  const bodyHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : template.bodyHtml;
  const contentChanged = subject !== template.subject || bodyHtml !== template.bodyHtml;

  const updated = await prisma.template.update({
    where: { id: template.id },
    data: {
      subject,
      bodyHtml,
      ...(typeof body.noAttachmentConfirmed === "boolean"
        ? { noAttachmentConfirmed: body.noAttachmentConfirmed }
        : {}),
      // Every content change is a new version; the send log records which
      // version each contact actually received.
      ...(contentChanged ? { version: { increment: 1 } } : {}),
    },
  });
  return NextResponse.json({ ok: true, version: updated.version });
});
