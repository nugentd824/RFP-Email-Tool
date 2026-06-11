import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";

export const GET = guarded(async (_req, params) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!attachment) throw new ApiError(404, "Attachment not found");
  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(attachment.size),
    },
  });
});

export const DELETE = guarded(async (_req, params) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!attachment) throw new ApiError(404, "Attachment not found");
  await prisma.$transaction([
    prisma.attachment.delete({ where: { id: params.id } }),
    prisma.template.update({
      where: { id: attachment.templateId },
      data: { version: { increment: 1 } },
    }),
  ]);
  return NextResponse.json({ ok: true });
});
