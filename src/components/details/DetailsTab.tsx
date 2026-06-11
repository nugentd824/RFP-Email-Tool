"use client";

import { useState } from "react";
import type { ClientDetail } from "@/lib/types";
import { api } from "@/lib/clientApi";
import { ConfirmTypedModal } from "@/components/ui";
import { useToast } from "@/components/toast";

export function DetailsTab({
  client,
  onChanged,
}: {
  client: ClientDetail;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: client.name,
    engagement: client.engagement,
    notes: client.notes,
    status: client.status,
  });
  const [audForms, setAudForms] = useState(
    client.audiences.map((a) => ({
      id: a.id,
      label: a.label,
      targetSendDate: a.targetSendDate,
      bccEmails: a.bccEmails,
    }))
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveClient = async () => {
    setBusy(true);
    try {
      await api(`/api/clients/${client.id}`, { method: "PATCH", json: form });
      toast("Client details saved", "success");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const saveAudience = async (i: number) => {
    setBusy(true);
    try {
      const { id, ...payload } = audForms[i];
      await api(`/api/audiences/${id}`, { method: "PATCH", json: payload });
      toast("Audience saved", "success");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    try {
      await api(`/api/clients/${client.id}`, { method: "DELETE" });
      window.location.href = "/";
    } catch (e) {
      toast((e as Error).message, "error");
      setConfirmDelete(false);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="card">
        <h2>Engagement details</h2>
        <div className="grid-2" style={{ gap: 12 }}>
          <label className="field">
            <span>Client name</span>
            <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="field">
            <span>Engagement name / year</span>
            <input type="text" value={form.engagement} onChange={(e) => setForm((f) => ({ ...f, engagement: e.target.value }))} />
          </label>
        </div>
        <label className="field">
          <span>Status</span>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ClientDetail["status"] }))}
          >
            <option value="SETUP">Setup</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETE">Complete</option>
          </select>
        </label>
        <label className="field">
          <span>Internal notes</span>
          <textarea rows={4} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </label>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" disabled={busy} onClick={saveClient}>Save details</button>
        </div>
      </div>

      {audForms.map((a, i) => (
        <div key={a.id} className="card">
          <h2>Audience {client.audiences[i].key}</h2>
          <div className="grid-2" style={{ gap: 12 }}>
            <label className="field">
              <span>Label (e.g., &ldquo;Incumbent Suppliers&rdquo;)</span>
              <input
                type="text"
                value={a.label}
                onChange={(e) =>
                  setAudForms((fs) => fs.map((f, j) => (j === i ? { ...f, label: e.target.value } : f)))
                }
              />
            </label>
            <label className="field">
              <span>Target send date</span>
              <input
                type="date"
                value={a.targetSendDate}
                onChange={(e) =>
                  setAudForms((fs) => fs.map((f, j) => (j === i ? { ...f, targetSendDate: e.target.value } : f)))
                }
              />
            </label>
          </div>
          <label className="field">
            <span>BCC every send to (optional, comma-separated — for record-keeping)</span>
            <input
              type="text"
              placeholder="you@yourfirm.com, colleague@yourfirm.com"
              value={a.bccEmails}
              onChange={(e) =>
                setAudForms((fs) => fs.map((f, j) => (j === i ? { ...f, bccEmails: e.target.value } : f)))
              }
            />
          </label>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn primary" disabled={busy} onClick={() => saveAudience(i)}>
              Save audience
            </button>
          </div>
        </div>
      ))}

      <div className="card" style={{ borderColor: "var(--danger)" }}>
        <h2 style={{ color: "var(--danger)" }}>Danger zone</h2>
        <p className="subtle">
          Deletes this client with all contacts, templates, attachments, and send logs.
          Export the supplier list and send log first if you need them for the audit trail.
        </p>
        <button className="btn danger" onClick={() => setConfirmDelete(true)}>
          Delete client…
        </button>
      </div>

      {confirmDelete && (
        <ConfirmTypedModal
          title="Delete client"
          phrase={client.name}
          confirmLabel="Delete permanently"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={doDelete}
          description={
            <p style={{ margin: 0 }}>
              This permanently deletes <strong>{client.name}</strong> including its supplier
              list, both templates with attachments, and the entire send log.
            </p>
          }
        />
      )}
    </div>
  );
}
