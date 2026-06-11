// Microsoft Graph mail sending. Uses draft → attach → send (rather than the
// one-shot /sendMail) so attachments over the 4MB request cap still work via
// upload sessions.

const GRAPH = "https://graph.microsoft.com/v1.0";
const DIRECT_ATTACH_LIMIT = 3 * 1024 * 1024; // Graph cap for inline fileAttachment posts
const CHUNK = 3_276_800; // upload-session chunks must be multiples of 320 KiB

export type OutgoingAttachment = { fileName: string; mimeType: string; data: Buffer };

export type OutgoingMail = {
  to: string;
  subject: string;
  html: string;
  bcc: string[];
  attachments: OutgoingAttachment[];
};

export class GraphError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function gfetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error?.message) detail = `${body.error.code ?? res.status}: ${body.error.message}`;
    } catch {
      /* non-JSON error body */
    }
    throw new GraphError(res.status, detail);
  }
  return res;
}

async function uploadLargeAttachment(token: string, messageId: string, att: OutgoingAttachment) {
  const sessionRes = await gfetch(
    token,
    `/me/messages/${messageId}/attachments/createUploadSession`,
    {
      method: "POST",
      body: JSON.stringify({
        AttachmentItem: { attachmentType: "file", name: att.fileName, size: att.data.length },
      }),
    }
  );
  const { uploadUrl } = await sessionRes.json();
  for (let start = 0; start < att.data.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, att.data.length);
    const chunk = att.data.subarray(start, end);
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end - 1}/${att.data.length}`,
      },
      body: new Uint8Array(chunk),
    });
    if (!res.ok) throw new GraphError(res.status, `Attachment upload failed at byte ${start}`);
  }
}

export async function sendMailViaGraph(token: string, mail: OutgoingMail): Promise<void> {
  const draftRes = await gfetch(token, "/me/messages", {
    method: "POST",
    body: JSON.stringify({
      subject: mail.subject,
      body: { contentType: "HTML", content: mail.html },
      toRecipients: [{ emailAddress: { address: mail.to } }],
      bccRecipients: mail.bcc.map((address) => ({ emailAddress: { address } })),
    }),
  });
  const draft = await draftRes.json();

  try {
    for (const att of mail.attachments) {
      if (att.data.length <= DIRECT_ATTACH_LIMIT) {
        await gfetch(token, `/me/messages/${draft.id}/attachments`, {
          method: "POST",
          body: JSON.stringify({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: att.fileName,
            contentType: att.mimeType,
            contentBytes: att.data.toString("base64"),
          }),
        });
      } else {
        await uploadLargeAttachment(token, draft.id, att);
      }
    }
    await gfetch(token, `/me/messages/${draft.id}/send`, { method: "POST" });
  } catch (e) {
    // Don't leave half-built drafts littering the user's mailbox on failure.
    await fetch(`${GRAPH}/me/messages/${draft.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    throw e;
  }
}
