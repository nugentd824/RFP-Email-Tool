import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import { isValidEmail } from "@/lib/format";

export const PATCH = guarded(async (req, params) => {
  const body = await req.json();
  const data: Record<string, string> = {};
  if (typeof body.label === "string") {
    if (!body.label.trim()) throw new ApiError(400, "Audience label cannot be empty");
    data.label = body.label.trim();
  }
  if (typeof body.targetSendDate === "string") {
    if (body.targetSendDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.targetSendDate))
      throw new ApiError(400, "Target send date must be YYYY-MM-DD");
    data.targetSendDate = body.targetSendDate;
  }
  if (typeof body.bccEmails === "string") {
    const bad = body.bccEmails
      .split(",")
      .map((e: string) => e.trim())
      .filter((e: string) => e && !isValidEmail(e));
    if (bad.length) throw new ApiError(400, `Invalid BCC address: ${bad.join(", ")}`);
    data.bccEmails = body.bccEmails;
  }
  await prisma.audience.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
});
