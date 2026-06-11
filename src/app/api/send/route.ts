import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import { renderMerge, contactMergeContext } from "@/lib/merge";
import { sendMailViaGraph } from "@/lib/graph";
import { emailHtmlWrap, loadAudienceBundle, parseBcc } from "@/lib/sendMail";

// Sends ONE personalized email to ONE contact. The browser drives the send
// loop (one call per recipient, throttled client-side) so long campaigns
// never hit serverless time limits and every message is individually logged.
export const POST = guarded(async (req, _params, session) => {
  if (!session.accessToken)
    throw new ApiError(401, "Microsoft sign-in token unavailable — sign out and back in.");

  const { audienceId, contactId } = await req.json();
  const audience = await loadAudienceBundle(audienceId);
  const template = audience.template!;
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });

  if (!contact || contact.clientId !== audience.clientId)
    throw new ApiError(404, "Contact not found");
  if (contact.audienceId !== audience.id)
    throw new ApiError(400, `${contact.email} is not assigned to ${audience.label}`);
  if (!contact.emailValid)
    throw new ApiError(400, `${contact.email} is not a valid email address`);
  if (!template.subject.trim() || !template.bodyHtml.trim())
    throw new ApiError(400, "Template subject and body must not be empty");

  const ctx = contactMergeContext(contact, audience.client.name);
  const subject = renderMerge(template.subject, ctx);
  const html = emailHtmlWrap(renderMerge(template.bodyHtml, ctx));

  const logBase = {
    clientId: audience.clientId,
    contactId: contact.id,
    audienceId: audience.id,
    toEmail: contact.email,
    contactName: `${contact.firstName} ${contact.lastName}`.trim(),
    audienceLabel: audience.label,
    subject,
    templateVersion: template.version,
    isTest: false,
  };

  try {
    await sendMailViaGraph(session.accessToken, {
      to: contact.email,
      subject,
      html,
      bcc: parseBcc(audience.bccEmails),
      attachments: template.attachments.map((a) => ({
        fileName: a.fileName,
        mimeType: a.mimeType,
        data: Buffer.from(a.data),
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    const log = await prisma.sendLog.create({
      data: { ...logBase, status: "FAILED", error: message },
    });
    return NextResponse.json({ error: message, log }, { status: 502 });
  }

  const log = await prisma.sendLog.create({ data: { ...logBase, status: "SENT" } });
  return NextResponse.json({ log });
});
