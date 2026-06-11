import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";

// Replaces this audience's template (subject, body, attachments) with a copy
// of another audience's template. The UI confirms before overwriting.
export const POST = guarded(async (req, params) => {
  const { sourceAudienceId } = await req.json();
  const [target, source] = await Promise.all([
    prisma.template.findUnique({ where: { audienceId: params.id } }),
    prisma.template.findUnique({
      where: { audienceId: sourceAudienceId },
      include: { attachments: true },
    }),
  ]);
  if (!target) throw new ApiError(404, "Template not found");
  if (!source) throw new ApiError(404, "Source template not found");
  if (target.id === source.id) throw new ApiError(400, "Cannot copy a template onto itself");

  await prisma.$transaction([
    prisma.attachment.deleteMany({ where: { templateId: target.id } }),
    prisma.template.update({
      where: { id: target.id },
      data: {
        subject: source.subject,
        bodyHtml: source.bodyHtml,
        noAttachmentConfirmed: source.noAttachmentConfirmed,
        version: { increment: 1 },
      },
    }),
    ...source.attachments.map((a) =>
      prisma.attachment.create({
        data: {
          templateId: target.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          size: a.size,
          data: a.data,
        },
      })
    ),
  ]);
  return NextResponse.json({ ok: true });
});
