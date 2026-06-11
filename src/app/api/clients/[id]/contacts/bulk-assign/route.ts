import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";

export const POST = guarded(async (req, params) => {
  const { contactIds, audienceId } = await req.json();
  if (!Array.isArray(contactIds) || contactIds.length === 0)
    throw new ApiError(400, "No contacts selected");
  if (audienceId !== null) {
    const audience = await prisma.audience.findUnique({ where: { id: audienceId } });
    if (!audience || audience.clientId !== params.id)
      throw new ApiError(400, "Audience does not belong to this client");
  }
  const result = await prisma.contact.updateMany({
    where: { id: { in: contactIds }, clientId: params.id },
    data: { audienceId },
  });
  return NextResponse.json({ updated: result.count });
});
