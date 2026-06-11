import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import { isValidEmail } from "@/lib/format";

export const GET = guarded(async (_req, params) => {
  const contacts = await prisma.contact.findMany({
    where: { clientId: params.id },
    orderBy: [{ company: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
  return NextResponse.json(contacts);
});

// Manual single-contact add.
export const POST = guarded(async (req, params) => {
  const body = await req.json();
  const email = (body.email ?? "").trim();
  if (!email) throw new ApiError(400, "Email address is required");

  if (!body.force) {
    const existing = await prisma.contact.findFirst({
      where: { clientId: params.id, email: { equals: email, mode: "insensitive" } },
    });
    if (existing)
      throw new ApiError(
        409,
        `A contact with ${email} already exists (${existing.firstName} ${existing.lastName}, ${existing.company}). Submit again with "add anyway" to create a duplicate.`
      );
  }

  const contact = await prisma.contact.create({
    data: {
      clientId: params.id,
      company: (body.company ?? "").trim(),
      firstName: (body.firstName ?? "").trim(),
      lastName: (body.lastName ?? "").trim(),
      email,
      title: (body.title ?? "").trim(),
      category: (body.category ?? "").trim(),
      notes: body.notes ?? "",
      emailValid: isValidEmail(email),
      audienceId: body.audienceId ?? null,
    },
  });
  return NextResponse.json(contact, { status: 201 });
});
