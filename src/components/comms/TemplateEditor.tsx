"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { AudienceDTO, ClientDetail } from "@/lib/types";
import { api } from "@/lib/clientApi";
import { MERGE_FIELDS } from "@/lib/merge";
import { fmtBytes, fmtET } from "@/lib/format";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/toast";
import { CopyTemplateModal } from "./CopyTemplateModal";

export function TemplateEditor({
  client,
  audience,
  onChanged,
}: {
  client: ClientDetail;
  audience: AudienceDTO;
  onChanged: () => void;
}) {
  const toast = useToast();
  const template = audience.template;
  const [subject, setSubject] = useState(template.subject);
  const [busy, setBusy] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: template.bodyHtml || "<p></p>",
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
  });

  const bodyHtml = () => editor?.getHTML() ?? template.bodyHtml;
  const dirty = subject !== template.subject || (editor ? editor.getHTML() !== (template.bodyHtml || "<p></p>") : false);
  const partiallySent = audience.sentCount > 0;

  const doSave = async () => {
    setBusy(true);
    try {
      const res = await api<{ version: number }>(`/api/audiences/${audience.id}/template`, {
        method: "PUT",
        json: { subject, bodyHtml: bodyHtml() },
      });
      toast(`${audience.label} template saved (now version ${res.version})`, "success");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      setConfirmSave(false);
    }
  };

  const save = () => {
    if (partiallySent && dirty) setConfirmSave(true);
    else doSave();
  };

  const confirmAttachmentChange = (): boolean => {
    if (!partiallySent) return true;
    return window.confirm(
      `${audience.sentCount} of ${audience.assignedCount} recipients in "${audience.label}" already received version ${template.version}. ` +
        `Changing attachments creates a new version — remaining recipients get the updated email. Continue?`
    );
  };

  const uploadFiles = async (files: FileList) => {
    if (!confirmAttachmentChange()) return;
    setBusy(true);
    let okCount = 0;
    for (const file of Array.from(files)) {
      try {
        const form = new FormData();
        form.append("file", file);
        await api(`/api/audiences/${audience.id}/template/attachments`, {
          method: "POST",
          body: form,
        });
        okCount++;
      } catch (e) {
        toast(`${file.name}: ${(e as Error).message}`, "error");
      }
    }
    if (okCount > 0) toast(`${okCount} attachment(s) added`, "success");
    setBusy(false);
    onChanged();
  };

  const removeAttachment = async (id: string, name: string) => {
    if (!confirmAttachmentChange()) return;
    if (!window.confirm(`Remove attachment "${name}"?`)) return;
    try {
      await api(`/api/attachments/${id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const insertMergeField = (token: string, target: "subject" | "body") => {
    if (target === "body") {
      editor?.chain().focus().insertContent(token).run();
    } else {
      const el = subjectRef.current;
      const pos = el?.selectionStart ?? subject.length;
      setSubject((s) => s.slice(0, pos) + token + s.slice(pos));
      el?.focus();
    }
  };

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (leave empty to remove):", prev ?? "https://");
    if (url === null) return;
    if (url === "" || url === "https://") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const totalAttachmentSize = template.attachments.reduce((s, a) => s + a.size, 0);

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="row between">
        <div>
          <h2 style={{ marginBottom: 0 }}>{audience.label}</h2>
          <span className="faint">
            {audience.assignedCount} recipient(s) · version {template.version} · saved {fmtET(template.updatedAt)}
          </span>
        </div>
        <div className="row">
          {partiallySent && <span className="pill amber">{audience.sentCount} already sent</span>}
          <button className="btn sm" onClick={() => setShowCopy(true)}>Copy from…</button>
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        <input
          ref={subjectRef}
          type="text"
          placeholder="Subject line — merge fields work here too"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          value=""
          title="Insert merge field into subject"
          onChange={(e) => { if (e.target.value) insertMergeField(e.target.value, "subject"); }}
          style={{ width: 110 }}
        >
          <option value="">+ field</option>
          {MERGE_FIELDS.map((f) => (
            <option key={f.token} value={f.token}>{f.label}</option>
          ))}
        </select>
      </div>

      <div className="rte">
        <div className="rte-toolbar">
          <button type="button" className={editor?.isActive("bold") ? "on" : ""} title="Bold"
            onClick={() => editor?.chain().focus().toggleBold().run()}><b>B</b></button>
          <button type="button" className={editor?.isActive("italic") ? "on" : ""} title="Italic"
            onClick={() => editor?.chain().focus().toggleItalic().run()}><i>I</i></button>
          <button type="button" className={editor?.isActive("underline") ? "on" : ""} title="Underline"
            onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></button>
          <span className="divider" />
          <button type="button" className={editor?.isActive("bulletList") ? "on" : ""} title="Bullet list"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}>• ≡</button>
          <button type="button" className={editor?.isActive("orderedList") ? "on" : ""} title="Numbered list"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</button>
          <span className="divider" />
          <button type="button" className={editor?.isActive("link") ? "on" : ""} title="Insert link" onClick={setLink}>🔗</button>
          <button type="button" title="Clear formatting"
            onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}>⌫</button>
          <span className="divider" />
          <select
            value=""
            title="Insert merge field"
            onChange={(e) => { if (e.target.value) insertMergeField(e.target.value, "body"); }}
          >
            <option value="">Insert merge field…</option>
            {MERGE_FIELDS.map((f) => (
              <option key={f.token} value={f.token}>{f.label} — {f.token}</option>
            ))}
          </select>
        </div>
        <EditorContent editor={editor} />
      </div>

      <div>
        <div className="row between">
          <h3 style={{ marginBottom: 4 }}>
            Attachments{" "}
            <span className="faint">
              {template.attachments.length > 0 && `(${fmtBytes(totalAttachmentSize)} total)`}
            </span>
          </h3>
          <button className="btn sm" disabled={busy} onClick={() => fileInput.current?.click()}>
            + Add files
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {template.attachments.length === 0 ? (
          <p className="faint" style={{ margin: 0 }}>
            No attachments. PDF, Word, and Excel files up to 4 MB each.
          </p>
        ) : (
          <div className="row wrap" style={{ gap: 6 }}>
            {template.attachments.map((a) => (
              <span key={a.id} className="attachment-chip">
                <a href={`/api/attachments/${a.id}`}>{a.fileName}</a>
                <span className="faint">{fmtBytes(a.size)}</span>
                <button title="Remove" onClick={() => removeAttachment(a.id, a.fileName)}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="row between">
        <span className="faint">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <button className="btn primary" disabled={busy || !dirty} onClick={save}>
          Save template
        </button>
      </div>

      {confirmSave && (
        <Modal
          title="Template already partially sent"
          onClose={() => setConfirmSave(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmSave(false)}>Cancel</button>
              <button className="btn primary" disabled={busy} onClick={doSave}>
                Save as version {template.version + 1}
              </button>
            </>
          }
        >
          <p>
            <strong>{audience.sentCount} of {audience.assignedCount}</strong> recipients in{" "}
            <strong>{audience.label}</strong> already received <strong>version {template.version}</strong>.
          </p>
          <p>
            Saving creates <strong>version {template.version + 1}</strong>. Recipients who
            haven&rsquo;t been sent yet will receive the new version, and the send log records
            exactly which version each contact got.
          </p>
        </Modal>
      )}

      {showCopy && (
        <CopyTemplateModal
          targetAudience={audience}
          clientName={client.name}
          onClose={() => setShowCopy(false)}
          onCopied={() => {
            setShowCopy(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
