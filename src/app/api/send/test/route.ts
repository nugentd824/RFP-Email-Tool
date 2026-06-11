import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guarded, ApiError } from "@/lib/api";
import { renderMerge, contactMergeContext, type MergeContext } from "@/lib/merge";
import { sendMailViaGraph } from "@/lib/graph";
import { emailHtmlWrap, loadAudienceBundle } from "@/lib/sendMail";

const SAMPLE_CTX = (clientName: string): MergeContext => ({
  firstName: "Alex",
  lastName: "Sample",
  supplierCompany: "Sample Supplier Co.",
  clientName,
  title: "Procurement Manager",
  category: "Packaging",
  email: "alex.sample@example.com",
});

// Sends the rendered email to the signed-in user's own address.
export const POST = guarded(async (req, _params, session) => {
  if (!session.accessToken)
    throw new ApiError(401, "Microsoft sign-in token unavailable — sign out and back in.");
  const myEmail = session.user!.email!;

  const { audienceId, sampleContactId } = await req.json();
  const audience = await loadAudienceBundle(audienceId);
  const template = audience.template!;
  if (!template.subject.trim() || !template.bodyHtml.trim())
    throw new ApiError(400, "Template subject and body must not be empty");

  let ctx = SAMPLE_CTX(audience.client.name);
  if (sampleContactId) {
    const contact = await prisma.contact.findUnique({ where: { id: sampleContactId } });
    if (contact && contact.clientId === audience.clientId)
      ctx = contactMergeContext(contact, audience.client.name);
  }

  const subject = `[TEST] ${renderMerge(template.subject, ctx)}`;
  const html = emailHtmlWrap(renderMerge(template.bodyHtml, ctx));

  const logBase = {
    clientId: audience.clientId,
    audienceId: audience.id,
    toEmail: myEmail,
    contactName: "(test to self)",
    audienceLabel: audience.label,
    subject,
    templateVersion: template.version,
    isTest: true,
  };

  try {
    await sendMailViaGraph(session.accessToken, {
      to: myEmail,
      subject,
      html,
      bcc: [],
      attachments: template.attachments.map((a) => ({
        fileName: a.fileName,
        mimeType: a.mimeType,
        data: Buffer.from(a.data),
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    await prisma.sendLog.create({ data: { ...logBase, status: "FAILED", error: message } });
    throw new ApiError(502, message);
  }

  await prisma.sendLog.create({ data: { ...logBase, status: "SENT" } });
  return NextResponse.json({ ok: true, sentTo: myEmail });
});
