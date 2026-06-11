import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded } from "@/lib/api";

export const GET = guarded(async (_req, params) => {
  const logs = await prisma.sendLog.findMany({
    where: { clientId: params.id },
    orderBy: { sentAt: "desc" },
    take: 5000,
  });
  return NextResponse.json(logs);
});
