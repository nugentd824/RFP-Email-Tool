import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import { fmtBytes } from "@/lib/format";

// Vercel serverless caps request bodies at ~4.5MB, so each file must come in
// its own request and stay under PER_FILE_LIMIT.
const PER_FILE_LIMIT = 4 * 1024 * 1024;
const PER_TEMPLATE_LIMIT = 25 * 1024 * 1024;

export const POST = guarded(async (req, params) => {
  const template = await prisma.template.findUnique({
    where: { audienceId: params.id },
    include: { attachments: { select: { size: true } } },
  });
  if (!template) throw new ApiError(404, "Template not found");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file provided");
  if (file.size > PER_FILE_LIMIT)
    throw new ApiError(
      413,
      `${file.name} is ${fmtBytes(file.size)} — files must be under ${fmtBytes(PER_FILE_LIMIT)} each`
    );
  const existingTotal = template.attachments.reduce((s, a) => s + a.size, 0);
  if (existingTotal + file.size > PER_TEMPLATE_LIMIT)
    throw new ApiError(
      413,
      `Total attachments would exceed ${fmtBytes(PER_TEMPLATE_LIMIT)} — most mail gateways reject messages that large`
    );

  const data = Buffer.from(await file.arrayBuffer());
  const [attachment] = await prisma.$transaction([
    prisma.attachment.create({
      data: {
        templateId: template.id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        data,
      },
      select: { id: true, fileName: true, mimeType: true, size: true },
    }),
    prisma.template.update({
      where: { id: template.id },
      data: { version: { increment: 1 } },
    }),
  ]);
  return NextResponse.json(attachment, { status: 201 });
});
