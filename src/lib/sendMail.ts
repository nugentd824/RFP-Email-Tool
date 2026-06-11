import { prisma } from "./db";
import { ApiError } from "./api";

// Minimal email-safe wrapper around the Tiptap-generated body HTML.
export function emailHtmlWrap(bodyHtml: string): string {
  return (
    `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; ` +
    `line-height: 1.5; color: #1a1a1a; max-width: 720px;">${bodyHtml}</div>`
  );
}

export async function loadAudienceBundle(audienceId: string) {
  const audience = await prisma.audience.findUnique({
    where: { id: audienceId },
    include: { client: true, template: { include: { attachments: true } } },
  });
  if (!audience?.template) throw new ApiError(404, "Audience not found");
  return audience;
}

export function parseBcc(bccEmails: string): string[] {
  return bccEmails
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}
