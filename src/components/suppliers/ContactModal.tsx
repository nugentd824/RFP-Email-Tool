"use client";

import { useState } from "react";
import type { ClientDetail, ContactDTO } from "@/lib/types";
import { api } from "@/lib/clientApi";
import { isValidEmail } from "@/lib/format";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/toast";

export function ContactModal({
  client,
  contact,
  onClose,
  onSaved,
}: {
  client: ClientDetail;
  contact: ContactDTO | null; // null = add new
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    company: contact?.company ?? "",
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? "",
    title: contact?.title ?? "",
    category: contact?.category ?? "",
    notes: contact?.notes ?? "",
    audienceId: contact?.audienceId ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const set = (k: string, v: string | null) => setForm((f) => ({ ...f, [k]: v }));

  const emailOk = isValidEmail(form.email);

  const submit = async (force = false) => {
    setBusy(true);
    setConflict(null);
    try {
      if (contact) {
        await api(`/api/contacts/${contact.id}`, { method: "PATCH", json: form });
        toast("Contact updated", "success");
      } else {
        await api(`/api/clients/${client.id}/contacts`, { json: { ...form, force } });
        toast("Contact added", "success");
      }
      onSaved();
    } catch (e) {
      const msg = (e as Error).message;
      if (!contact && msg.includes("already exists")) setConflict(msg);
      else toast(msg, "error");
      setBusy(false);
    }
  };

  const del = async () => {
    if (!contact) return;
    if (!window.confirm(`Delete ${contact.email}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/contacts/${contact.id}`, { method: "DELETE" });
      toast("Contact deleted", "success");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={contact ? "Edit contact" : "Add contact"}
      onClose={onClose}
      footer={
        <>
          {contact && (
            <button className="btn danger" disabled={busy} onClick={del} style={{ marginRight: "auto" }}>
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={busy || !form.email.trim()}
            onClick={() => submit(false)}
          >
            {contact ? "Save changes" : "Add contact"}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <div className="grid-2" style={{ gap: 12 }}>
          <label className="field">
            <span>Supplier company</span>
            <input type="text" autoFocus value={form.company} onChange={(e) => set("company", e.target.value)} />
          </label>
          <label className="field">
            <span>Email address *</span>
            <input type="text" value={form.email} onChange={(e) => set("email", e.target.value)} />
            {form.email.trim() !== "" && !emailOk && (
              <span className="faint" style={{ color: "var(--danger)" }}>
                Doesn&rsquo;t look like a valid address — it will be flagged and blocked from sends.
              </span>
            )}
          </label>
          <label className="field">
            <span>First name</span>
            <input type="text" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </label>
          <label className="field">
            <span>Last name</span>
            <input type="text" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </label>
          <label className="field">
            <span>Title</span>
            <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="field">
            <span>Category / commodity</span>
            <input type="text" value={form.category} onChange={(e) => set("category", e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Audience</span>
          <select
            value={form.audienceId ?? ""}
            onChange={(e) => set("audienceId", e.target.value === "" ? null : e.target.value)}
          >
            <option value="">Unassigned</option>
            {client.audiences.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
        {conflict && (
          <div className="pill amber" style={{ display: "block", padding: "8px 12px", whiteSpace: "normal" }}>
            {conflict}{" "}
            <button type="button" className="btn sm" style={{ marginLeft: 8 }} onClick={() => submit(true)}>
              Add anyway
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
