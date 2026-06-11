import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import { isValidEmail } from "@/lib/format";

export const PATCH = guarded(async (req, params) => {
  const body = await req.json();
  const contact = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!contact) throw new ApiError(404, "Contact not found");

  const data: Record<string, string | boolean | null> = {};
  for (const k of ["company", "firstName", "lastName", "title", "category", "notes"] as const) {
    if (typeof body[k] === "string") data[k] = body[k].trim();
  }
  if (typeof body.email === "string") {
    const email = body.email.trim();
    if (!email) throw new ApiError(400, "Email address cannot be empty");
    data.email = email;
    data.emailValid = isValidEmail(email);
  }
  if ("audienceId" in body) {
    if (body.audienceId !== null) {
      const audience = await prisma.audience.findUnique({ where: { id: body.audienceId } });
      if (!audience || audience.clientId !== contact.clientId)
        throw new ApiError(400, "Audience does not belong to this client");
    }
    data.audienceId = body.audienceId;
  }

  const updated = await prisma.contact.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
});

export const DELETE = guarded(async (_req, params) => {
  await prisma.contact.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
