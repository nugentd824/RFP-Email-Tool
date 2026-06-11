import { prisma } from "./db";
import type { SendStatus } from "./types";

// Map of "contactId|audienceId" for every real (non-test) successful send.
export async function sentPairs(clientId?: string): Promise<Set<string>> {
  const logs = await prisma.sendLog.findMany({
    where: { status: "SENT", isTest: false, ...(clientId ? { clientId } : {}) },
    distinct: ["contactId", "audienceId"],
    select: { contactId: true, audienceId: true },
  });
  return new Set(
    logs.filter((l) => l.contactId && l.audienceId).map((l) => `${l.contactId}|${l.audienceId}`)
  );
}

export function deriveSendStatus(assigned: number, sent: number): SendStatus {
  if (sent === 0) return "NOT_SENT";
  if (assigned > 0 && sent >= assigned) return "SENT";
  return "PARTIAL";
}
