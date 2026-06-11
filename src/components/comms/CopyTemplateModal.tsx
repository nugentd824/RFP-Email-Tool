"use client";

import { useEffect, useState } from "react";
import type { AudienceDTO, TemplateSource } from "@/lib/types";
import { api } from "@/lib/clientApi";
import { fmtET } from "@/lib/format";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/toast";

export function CopyTemplateModal({
  targetAudience,
  clientName,
  onClose,
  onCopied,
}: {
  targetAudience: AudienceDTO;
  clientName: string;
  onClose: () => void;
  onCopied: () => void;
}) {
  const toast = useToast();
  const [sources, setSources] = useState<TemplateSource[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<TemplateSource[]>("/api/templates/sources")
      .then((s) => setSources(s.filter((x) => x.audienceId !== targetAudience.id)))
      .catch((e) => toast((e as Error).message, "error"));
  }, [targetAudience.id, toast]);

  const hasContent =
    targetAudience.template.subject.trim() !== "" ||
    targetAudience.template.bodyHtml.replace(/<[^>]+>/g, "").trim() !== "" ||
    targetAudience.template.attachments.length > 0;

  const copy = async () => {
    if (
      hasContent &&
      !window.confirm(
        `This replaces the current subject, body, and attachments of "${targetAudience.label}" (${clientName}). Continue?`
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/api/audiences/${targetAudience.id}/template/copy`, {
        json: { sourceAudienceId: selected },
      });
      toast("Template copied — adapt it as needed", "success");
      onCopied();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Copy template into “${targetAudience.label}”`}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!selected || busy} onClick={copy}>
            Copy template
          </button>
        </>
      }
    >
      {sources === null ? (
        <p className="subtle">Loading templates…</p>
      ) : sources.length === 0 ? (
        <p className="subtle">
          No other templates exist yet. Build one in any client&rsquo;s Communications tab and it
          will appear here for reuse.
        </p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 360 }}>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>Client</th>
                <th>Audience</th>
                <th>Subject</th>
                <th>Attachments</th>
                <th>Last edited</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr
                  key={s.audienceId}
                  className={selected === s.audienceId ? "selected" : ""}
                  onClick={() => setSelected(s.audienceId)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <input
                      type="radio"
                      checked={selected === s.audienceId}
                      onChange={() => setSelected(s.audienceId)}
                    />
                  </td>
                  <td>
                    <strong>{s.clientName}</strong>
                    {s.engagement && <div className="faint">{s.engagement}</div>}
                  </td>
                  <td>{s.audienceLabel}</td>
                  <td>{s.subject || <span className="faint">(no subject)</span>}</td>
                  <td>{s.attachmentCount > 0 ? `${s.attachmentCount} file(s)` : "—"}</td>
                  <td className="faint">{fmtET(s.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
