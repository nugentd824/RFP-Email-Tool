"use client";

import { useMemo, useRef, useState } from "react";
import type { ClientDetail, ContactDTO } from "@/lib/types";
import { api } from "@/lib/clientApi";
import { exportXlsx } from "@/lib/excel";
import { Modal, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { ImportWizard } from "./ImportWizard";
import { ContactModal } from "./ContactModal";

type SortKey = "company" | "name" | "email" | "category" | "audience";

export function SuppliersTab({
  client,
  contacts,
  onChanged,
}: {
  client: ClientDetail;
  contacts: ContactDTO[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [validityFilter, setValidityFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("company");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClickIndex = useRef<number>(-1);
  const [showImport, setShowImport] = useState(false);
  const [editContact, setEditContact] = useState<ContactDTO | "new" | null>(null);
  const [dupContact, setDupContact] = useState<ContactDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const audienceById = useMemo(
    () => Object.fromEntries(client.audiences.map((a) => [a.id, a])),
    [client.audiences]
  );
  const categories = useMemo(
    () => [...new Set(contacts.map((c) => c.category).filter(Boolean))].sort(),
    [contacts]
  );
  const unassignedCount = contacts.filter((c) => c.audienceId === null).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = contacts.filter((c) => {
      if (q) {
        const hay = `${c.company} ${c.firstName} ${c.lastName} ${c.email} ${c.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (audienceFilter === "UNASSIGNED" && c.audienceId !== null) return false;
      if (audienceFilter !== "ALL" && audienceFilter !== "UNASSIGNED" && c.audienceId !== audienceFilter)
        return false;
      if (categoryFilter !== "ALL" && c.category !== categoryFilter) return false;
      if (validityFilter === "INVALID" && c.emailValid) return false;
      if (validityFilter === "DUPLICATED" && !c.duplicateOfId) return false;
      return true;
    });
    const keyFn = (c: ContactDTO): string => {
      switch (sortKey) {
        case "company": return c.company.toLowerCase();
        case "name": return `${c.lastName} ${c.firstName}`.toLowerCase();
        case "email": return c.email.toLowerCase();
        case "category": return c.category.toLowerCase();
        case "audience": return c.audienceId ? audienceById[c.audienceId]?.label ?? "" : "~unassigned";
      }
    };
    list = [...list].sort((a, b) => keyFn(a).localeCompare(keyFn(b)) * sortDir);
    return list;
  }, [contacts, search, audienceFilter, categoryFilter, validityFilter, sortKey, sortDir, audienceById]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const clickRowCheckbox = (index: number, id: string, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickIndex.current >= 0) {
        const [from, to] = [lastClickIndex.current, index].sort((a, b) => a - b);
        const turnOn = !prev.has(id);
        for (let i = from; i <= to; i++) {
          const rid = filtered[i]?.id;
          if (!rid) continue;
          if (turnOn) next.add(rid);
          else next.delete(rid);
        }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClickIndex.current = index;
  };

  const bulkAssign = async (audienceId: string | null) => {
    setBusy(true);
    try {
      const { updated } = await api<{ updated: number }>(
        `/api/clients/${client.id}/contacts/bulk-assign`,
        { json: { contactIds: [...selected], audienceId } }
      );
      toast(
        audienceId
          ? `${updated} contact(s) assigned to ${audienceById[audienceId].label}`
          : `${updated} contact(s) unassigned`,
        "success"
      );
      setSelected(new Set());
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} selected contact(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await Promise.all([...selected].map((cid) => api(`/api/contacts/${cid}`, { method: "DELETE" })));
      toast(`${selected.size} contact(s) deleted`, "success");
      setSelected(new Set());
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const setRowAudience = async (contact: ContactDTO, value: string) => {
    try {
      await api(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        json: { audienceId: value === "" ? null : value },
      });
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const doExport = () => {
    exportXlsx(
      `${client.name.replace(/[^\w]+/g, "-")}-suppliers.xlsx`,
      "Suppliers",
      ["Supplier Company Name", "Contact First Name", "Contact Last Name", "Email Address",
        "Title", "Category/Commodity", "Notes", "Audience", "Email Valid", "Duplicate Record"],
      contacts.map((c) => [
        c.company, c.firstName, c.lastName, c.email, c.title, c.category, c.notes,
        c.audienceId ? audienceById[c.audienceId]?.label ?? "" : "Unassigned",
        c.emailValid ? "Yes" : "NO",
        c.duplicateOfId ? "Yes" : "",
      ])
    );
  };

  if (contacts.length === 0 && !showImport) {
    return (
      <>
        <EmptyState
          title="Import a supplier list to get started"
          hint="Upload the client's Excel or CSV contact list — you'll map columns and review every row before anything is saved."
          action={
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn primary" onClick={() => setShowImport(true)}>
                Import Excel / CSV
              </button>
              <button className="btn" onClick={() => setEditContact("new")}>
                Add contact manually
              </button>
            </div>
          }
        />
        {editContact && (
          <ContactModal
            client={client}
            contact={editContact === "new" ? null : editContact}
            onClose={() => setEditContact(null)}
            onSaved={() => {
              setEditContact(null);
              onChanged();
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="stack">
      <div className="row wrap between">
        <div className="row wrap">
          <input
            type="search"
            placeholder="Search company, name, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240 }}
          />
          <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}>
            <option value="ALL">All audiences</option>
            <option value="UNASSIGNED">Unassigned</option>
            {client.audiences.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          {categories.length > 0 && (
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="ALL">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <select value={validityFilter} onChange={(e) => setValidityFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="INVALID">Invalid email only</option>
            <option value="DUPLICATED">Duplicated records</option>
          </select>
        </div>
        <div className="row">
          <span className={`pill ${unassignedCount > 0 ? "amber" : "green"}`}>
            {unassignedCount} unassigned
          </span>
          <button className="btn" onClick={() => setEditContact("new")}>+ Add contact</button>
          <button className="btn" onClick={doExport}>Export Excel</button>
          <button className="btn primary" onClick={() => setShowImport(true)}>Import / Re-import</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="selection-bar">
          <strong>{selected.size} selected</strong>
          {client.audiences.map((a) => (
            <button key={a.id} className="btn sm" disabled={busy} onClick={() => bulkAssign(a.id)}>
              → {a.label}
            </button>
          ))}
          <button className="btn sm" disabled={busy} onClick={() => bulkAssign(null)}>
            Unassign
          </button>
          <button className="btn sm" disabled={busy} onClick={bulkDelete}>
            Delete
          </button>
          <span className="spacer" style={{ flex: 1 }} />
          <span className="kbd-hint" style={{ color: "#9fb3c8" }}>
            shift-click selects a range
          </span>
          <button className="btn sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="table-wrap" style={{ maxHeight: "64vh" }}>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(filtered.map((c) => c.id)) : new Set())
                  }
                  aria-label="Select all filtered"
                />
              </th>
              {([
                ["company", "Company"],
                ["name", "Contact"],
                ["email", "Email"],
                ["category", "Category"],
                ["audience", "Audience"],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th key={key} className="sortable" onClick={() => toggleSort(key)}>
                  {label} {sortKey === key ? (sortDir === 1 ? "▲" : "▼") : ""}
                </th>
              ))}
              <th>Title</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id} className={selected.has(c.id) ? "selected" : ""}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onClick={(e) => clickRowCheckbox(i, c.id, e.shiftKey)}
                    onChange={() => {}}
                    aria-label={`Select ${c.email}`}
                  />
                </td>
                <td style={{ fontWeight: 550 }}>
                  {c.company || <span className="faint">—</span>}
                  {c.duplicateOfId && (
                    <span className="pill blue" style={{ marginLeft: 6 }} title="Duplicated so this supplier receives both communications">
                      dup
                    </span>
                  )}
                </td>
                <td>{`${c.firstName} ${c.lastName}`.trim() || <span className="faint">—</span>}</td>
                <td>
                  <span className="mono">{c.email}</span>
                  {!c.emailValid && (
                    <span className="pill red" style={{ marginLeft: 6 }}>invalid</span>
                  )}
                </td>
                <td>{c.category}</td>
                <td>
                  <select
                    className="inline"
                    value={c.audienceId ?? ""}
                    onChange={(e) => setRowAudience(c, e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {client.audiences.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </td>
                <td className="subtle">{c.title}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn ghost sm" title="Edit" onClick={() => setEditContact(c)}>
                    Edit
                  </button>
                  <button
                    className="btn ghost sm"
                    title="Duplicate into the other audience (supplier receives both communications)"
                    onClick={() => setDupContact(c)}
                  >
                    ⧉
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="subtle" style={{ textAlign: "center", padding: 24 }}>
                  No contacts match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="faint">
        {filtered.length} of {contacts.length} contacts shown
      </p>

      {showImport && (
        <ImportWizard
          client={client}
          hasExisting={contacts.length > 0}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            onChanged();
          }}
        />
      )}
      {editContact && (
        <ContactModal
          client={client}
          contact={editContact === "new" ? null : editContact}
          onClose={() => setEditContact(null)}
          onSaved={() => {
            setEditContact(null);
            onChanged();
          }}
        />
      )}
      {dupContact && (
        <DuplicateModal
          client={client}
          contact={dupContact}
          onClose={() => setDupContact(null)}
          onDone={() => {
            setDupContact(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function DuplicateModal({
  client,
  contact,
  onClose,
  onDone,
}: {
  client: ClientDetail;
  contact: ContactDTO;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const other = client.audiences.find((a) => a.id !== contact.audienceId);
  const [target, setTarget] = useState<string>(other?.id ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/clients/${client.id}/contacts/duplicate`, {
        json: { contactId: contact.id, audienceId: target },
      });
      toast("Contact duplicated", "success");
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Duplicate into another audience"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!target || busy} onClick={submit}>
            Duplicate contact
          </button>
        </>
      }
    >
      <div className="stack">
        <p>
          <strong>
            {contact.firstName} {contact.lastName}
          </strong>{" "}
          ({contact.email}) will receive <strong>both communications</strong> — the original
          record stays in its current audience and a linked copy is added to the one below.
        </p>
        <p className="pill amber" style={{ alignSelf: "flex-start" }}>
          ⚠ This supplier will get two separate emails
        </p>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Duplicate into</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose audience…</option>
            {client.audiences
              .filter((a) => a.id !== contact.audienceId)
              .map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
