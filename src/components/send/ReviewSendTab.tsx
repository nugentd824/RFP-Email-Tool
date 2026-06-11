"use client";

import { useMemo, useState } from "react";
import type { AudienceDTO, ClientDetail, ContactDTO, SendLogDTO } from "@/lib/types";
import { api } from "@/lib/clientApi";
import { renderMerge, contactMergeContext, unknownTokens } from "@/lib/merge";
import { fmtBytes, fmtET } from "@/lib/format";
import { ConfirmTypedModal } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSendLoop, type SendItem } from "@/lib/useSendLoop";

const SOFT_SIZE_WARN = 10 * 1024 * 1024;

export function ReviewSendTab({
  client,
  contacts,
  logs,
  onActivity,
}: {
  client: ClientDetail;
  contacts: ContactDTO[];
  logs: SendLogDTO[];
  onActivity: () => void;
}) {
  return (
    <div className="stack">
      {client.audiences.map((a) => (
        <AudiencePanel
          key={a.id}
          client={client}
          audience={a}
          contacts={contacts}
          logs={logs}
          onActivity={onActivity}
        />
      ))}
    </div>
  );
}

function AudiencePanel({
  client,
  audience,
  contacts,
  logs,
  onActivity,
}: {
  client: ClientDetail;
  audience: AudienceDTO;
  contacts: ContactDTO[];
  logs: SendLogDTO[];
  onActivity: () => void;
}) {
  const toast = useToast();
  const template = audience.template;
  const { progress, start, cancel } = useSendLoop();
  const [unassignedConfirmed, setUnassignedConfirmed] = useState(false);
  const [previewId, setPreviewId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string> | null>(null); // null = default (all unsent)
  const [delaySec, setDelaySec] = useState(2);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  const recipients = useMemo(
    () => contacts.filter((c) => c.audienceId === audience.id),
    [contacts, audience.id]
  );
  const unassignedCount = contacts.filter((c) => c.audienceId === null).length;

  // Latest real (non-test) send per contact for this audience.
  const lastSend = useMemo(() => {
    const m = new Map<string, SendLogDTO>();
    for (const l of logs) {
      if (l.isTest || l.audienceId !== audience.id || !l.contactId) continue;
      if (!m.has(l.contactId)) m.set(l.contactId, l); // logs arrive newest-first
    }
    return m;
  }, [logs, audience.id]);

  const sentIds = useMemo(
    () => new Set([...lastSend.entries()].filter(([, l]) => l.status === "SENT").map(([id]) => id)),
    [lastSend]
  );
  const unsent = recipients.filter((c) => !sentIds.has(c.id));
  const effectiveSelection = selected ?? new Set(unsent.map((c) => c.id));
  const selectedRecipients = recipients.filter((c) => effectiveSelection.has(c.id));
  const selectedAlreadySent = selectedRecipients.filter((c) => sentIds.has(c.id)).length;

  // ── checklist ────────────────────────────────────────────────
  const invalidRecipients = recipients.filter((c) => !c.emailValid);
  const bodyText = template.bodyHtml.replace(/<[^>]+>/g, "").trim();
  const subjectOk = template.subject.trim() !== "";
  const bodyOk = bodyText !== "";
  const attachmentsOk = template.attachments.length > 0 || template.noAttachmentConfirmed;
  const unassignedOk = unassignedCount === 0 || unassignedConfirmed;
  const badTokens = unknownTokens(template.subject + " " + template.bodyHtml);
  const totalSize = template.attachments.reduce((s, a) => s + a.size, 0);

  const blockers: { ok: boolean; text: React.ReactNode; control?: React.ReactNode }[] = [
    {
      ok: recipients.length > 0,
      text: `Audience has recipients (${recipients.length} assigned)`,
    },
    {
      ok: unassignedOk,
      text:
        unassignedCount === 0
          ? "All contacts are assigned to an audience"
          : `${unassignedCount} contact(s) are still Unassigned`,
      control:
        unassignedCount > 0 ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={unassignedConfirmed}
              onChange={(e) => setUnassignedConfirmed(e.target.checked)}
            />
            <span>Leaving these unassigned is intentional</span>
          </label>
        ) : undefined,
    },
    {
      ok: invalidRecipients.length === 0,
      text:
        invalidRecipients.length === 0
          ? "No invalid email addresses in this audience"
          : `${invalidRecipients.length} invalid email(s): ${invalidRecipients
              .slice(0, 3)
              .map((c) => c.email)
              .join(", ")}${invalidRecipients.length > 3 ? "…" : ""} — fix them in the Supplier List tab`,
    },
    { ok: subjectOk, text: subjectOk ? "Subject line present" : "Subject line is empty" },
    { ok: bodyOk, text: bodyOk ? "Email body present" : "Email body is empty" },
    {
      ok: attachmentsOk,
      text:
        template.attachments.length > 0
          ? `${template.attachments.length} attachment(s), ${fmtBytes(totalSize)} total`
          : template.noAttachmentConfirmed
            ? "No attachment — confirmed intentional"
            : "No attachments uploaded",
      control:
        template.attachments.length === 0 ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={template.noAttachmentConfirmed}
              onChange={async (e) => {
                try {
                  await api(`/api/audiences/${audience.id}/template`, {
                    method: "PUT",
                    json: { noAttachmentConfirmed: e.target.checked },
                  });
                  onActivity();
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              }}
            />
            <span>No attachment intended for this audience</span>
          </label>
        ) : undefined,
    },
  ];
  const warnings: string[] = [];
  if (badTokens.length > 0)
    warnings.push(`Unrecognized merge field(s) will go out as literal text: ${badTokens.join(", ")}`);
  if (totalSize > SOFT_SIZE_WARN)
    warnings.push(
      `Attachments total ${fmtBytes(totalSize)} — many recipient mail gateways reject messages over 10 MB`
    );
  const allClear = blockers.every((b) => b.ok);

  // ── preview ──────────────────────────────────────────────────
  const previewContact =
    recipients.find((c) => c.id === previewId) ?? recipients[0] ?? null;
  const previewCtx = previewContact ? contactMergeContext(previewContact, client.name) : null;

  const sendTest = async () => {
    setTestBusy(true);
    try {
      const res = await api<{ sentTo: string }>("/api/send/test", {
        json: { audienceId: audience.id, sampleContactId: previewContact?.id },
      });
      toast(`Test email sent to ${res.sentTo}`, "success");
      onActivity();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setTestBusy(false);
    }
  };

  // ── sending ──────────────────────────────────────────────────
  const runSend = () => {
    setConfirmOpen(false);
    const items: SendItem[] = selectedRecipients.map((c) => ({
      contactId: c.id,
      audienceId: audience.id,
      label: c.email,
    }));
    start(items, delaySec * 1000, (ok, fail, cancelled) => {
      toast(
        `${audience.label}: ${ok} sent${fail ? `, ${fail} failed (see Tracking)` : ""}${cancelled ? " — cancelled" : ""}`,
        fail ? "error" : "success"
      );
      setSelected(null);
      onActivity();
    });
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const base = prev ?? new Set(unsent.map((c) => c.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="card stack">
      <div className="row between">
        <h2 style={{ marginBottom: 0 }}>
          {audience.label}{" "}
          <span className="faint" style={{ fontWeight: 400 }}>
            — {recipients.length} recipient(s), {sentIds.size} sent, template v{template.version}
          </span>
        </h2>
        {audience.bccEmails && <span className="pill gray">BCC: {audience.bccEmails}</span>}
      </div>

      <div className="grid-2">
        {/* checklist + send controls */}
        <div className="stack">
          <div>
            <h3>Pre-send checklist</h3>
            <ul className="checklist">
              {blockers.map((b, i) => (
                <li key={i} className={b.ok ? "pass" : "fail"}>
                  <span className="mark">{b.ok ? "✓" : "✗"}</span>
                  <span>
                    {b.text}
                    {b.control && <div style={{ marginTop: 4 }}>{b.control}</div>}
                  </span>
                </li>
              ))}
              {warnings.map((w, i) => (
                <li key={`w${i}`} className="warn">
                  <span className="mark">⚠</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>

          {recipients.length > 0 && (
            <div>
              <div className="row between">
                <h3 style={{ marginBottom: 4 }}>
                  Recipients — {effectiveSelection.size} of {recipients.length} selected
                </h3>
                <span className="row" style={{ gap: 6 }}>
                  <button className="btn ghost sm" onClick={() => setSelected(new Set(recipients.map((c) => c.id)))}>All</button>
                  <button className="btn ghost sm" onClick={() => setSelected(null)}>Unsent</button>
                  <button className="btn ghost sm" onClick={() => setSelected(new Set())}>None</button>
                </span>
              </div>
              <div className="table-wrap" style={{ maxHeight: 230 }}>
                <table className="data">
                  <tbody>
                    {recipients.map((c) => {
                      const last = lastSend.get(c.id);
                      return (
                        <tr key={c.id}>
                          <td style={{ width: 30 }}>
                            <input
                              type="checkbox"
                              checked={effectiveSelection.has(c.id)}
                              onChange={() => toggleSelected(c.id)}
                              disabled={progress.running}
                            />
                          </td>
                          <td>
                            {c.firstName} {c.lastName}
                            <span className="faint"> · {c.email}</span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {last?.status === "SENT" ? (
                              <span className="pill green" title={fmtET(last.sentAt)}>
                                sent v{last.templateVersion}
                              </span>
                            ) : last?.status === "FAILED" ? (
                              <span className="pill red">failed</span>
                            ) : (
                              <span className="pill gray">unsent</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {progress.running || progress.total > 0 ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="row between">
                <span className="subtle">
                  {progress.running
                    ? `Sending ${progress.done + 1} of ${progress.total}… ${progress.current ?? ""}`
                    : `Finished: ${progress.ok} sent, ${progress.fail} failed`}
                </span>
                {progress.running && (
                  <button className="btn sm" onClick={cancel}>Cancel after current</button>
                )}
              </div>
            </div>
          ) : null}

          <div className="row">
            <label className="row" style={{ gap: 6 }}>
              <span className="subtle">Delay between emails</span>
              <input
                type="number"
                min={0}
                max={30}
                value={delaySec}
                onChange={(e) => setDelaySec(Math.max(0, Number(e.target.value)))}
                style={{ width: 64 }}
              />
              <span className="subtle">sec</span>
            </label>
            <span style={{ flex: 1 }} />
            <button
              className="btn primary"
              disabled={!allClear || effectiveSelection.size === 0 || progress.running}
              onClick={() => setConfirmOpen(true)}
            >
              Send to {effectiveSelection.size} recipient(s)…
            </button>
          </div>
        </div>

        {/* per-recipient preview */}
        <div className="stack" style={{ gap: 10 }}>
          <div className="row between">
            <h3 style={{ marginBottom: 0 }}>Preview as recipient</h3>
            <button className="btn sm" disabled={testBusy || !subjectOk || !bodyOk} onClick={sendTest}>
              {testBusy ? "Sending…" : "Send test to myself"}
            </button>
          </div>
          {recipients.length === 0 ? (
            <p className="subtle">Assign contacts to this audience to preview their emails.</p>
          ) : (
            <>
              <select value={previewContact?.id ?? ""} onChange={(e) => setPreviewId(e.target.value)}>
                {recipients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} — {c.company} ({c.email})
                  </option>
                ))}
              </select>
              {previewCtx && (
                <div className="email-preview">
                  <div style={{ borderBottom: "1px solid #e3e6ea", paddingBottom: 8, marginBottom: 10 }}>
                    <div className="faint">To: {previewContact!.email}</div>
                    {audience.bccEmails && <div className="faint">BCC: {audience.bccEmails}</div>}
                    <strong>{renderMerge(template.subject, previewCtx) || "(no subject)"}</strong>
                  </div>
                  <div
                    dangerouslySetInnerHTML={{ __html: renderMerge(template.bodyHtml, previewCtx) }}
                  />
                  {template.attachments.length > 0 && (
                    <div style={{ borderTop: "1px solid #e3e6ea", paddingTop: 8, marginTop: 10 }}>
                      {template.attachments.map((a) => (
                        <span key={a.id} className="attachment-chip" style={{ marginRight: 6 }}>
                          📎 {a.fileName} <span className="faint">{fmtBytes(a.size)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {confirmOpen && (
        <ConfirmTypedModal
          title={`Send "${audience.label}" communication`}
          phrase={audience.label}
          confirmLabel={`Send ${effectiveSelection.size} email(s) now`}
          onClose={() => setConfirmOpen(false)}
          onConfirm={runSend}
          description={
            <div className="stack" style={{ gap: 6 }}>
              <p style={{ margin: 0 }}>
                <strong>{effectiveSelection.size}</strong> individual email(s) will be sent from
                your Microsoft 365 account — recipients never see each other.
                Throttled at one email every <strong>{delaySec}s</strong>.
              </p>
              {selectedAlreadySent > 0 && (
                <p className="pill amber" style={{ alignSelf: "flex-start" }}>
                  ⚠ includes {selectedAlreadySent} contact(s) who already received this communication
                </p>
              )}
              <p className="faint" style={{ margin: 0 }}>
                Keep this tab open until sending completes. You can cancel between messages.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
}
