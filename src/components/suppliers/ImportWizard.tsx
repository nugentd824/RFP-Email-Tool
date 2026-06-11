"use client";

import { useMemo, useRef, useState } from "react";
import type { ClientDetail, ImportDiff, ImportRow } from "@/lib/types";
import { api } from "@/lib/clientApi";
import { isValidEmail } from "@/lib/format";
import {
  FIELD_DEFS, type FieldKey, type ParsedWorkbook,
  readWorkbook, guessHeaderRowIndex, guessMapping, rowsFromGrid,
} from "@/lib/excel";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/toast";

type Step = "upload" | "mapping" | "review" | "diff";

export function ImportWizard({
  client,
  hasExisting,
  onClose,
  onImported,
}: {
  client: ClientDetail;
  hasExisting: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [wb, setWb] = useState<ParsedWorkbook | null>(null);
  const [sheet, setSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<FieldKey, number>>({} as Record<FieldKey, number>);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  // For same-email-different-data groups: winning row index, or "EXCLUDE"
  const [conflictChoice, setConflictChoice] = useState<Record<string, number | "EXCLUDE">>({});
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [includeChanged, setIncludeChanged] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const grid = wb && sheet ? wb.grids[sheet] ?? [] : [];
  const headers = grid[headerRow] ?? [];

  // ── step 1: file ──────────────────────────────────────────────
  const acceptFile = async (file: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast("Please choose an .xlsx, .xls, or .csv file", "error");
      return;
    }
    try {
      const parsed = await readWorkbook(file);
      const firstSheet =
        parsed.sheetNames.find((n) => (parsed.grids[n]?.length ?? 0) > 0) ?? parsed.sheetNames[0];
      if (!firstSheet || (parsed.grids[firstSheet]?.length ?? 0) === 0) {
        toast("That file appears to be empty", "error");
        return;
      }
      setFileName(file.name);
      setWb(parsed);
      selectSheet(parsed, firstSheet);
      setStep("mapping");
    } catch {
      toast("Could not read that file — is it a valid Excel/CSV export?", "error");
    }
  };

  const selectSheet = (parsed: ParsedWorkbook, name: string) => {
    setSheet(name);
    const g = parsed.grids[name] ?? [];
    const hr = guessHeaderRowIndex(g);
    setHeaderRow(hr);
    setMapping(guessMapping(g[hr] ?? []));
  };

  // ── step 2 → 3 ────────────────────────────────────────────────
  const toReview = () => {
    const parsed = rowsFromGrid(grid, headerRow, mapping);
    if (parsed.length === 0) {
      toast("No data rows found below the header row", "error");
      return;
    }
    setRows(parsed);
    setExcluded(new Set());
    setConflictChoice({});
    setStep("review");
  };

  // ── step 3 derived state ─────────────────────────────────────
  const analysis = useMemo(() => {
    const byEmail = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const key = r.email.trim().toLowerCase();
      if (!key) return;
      byEmail.set(key, [...(byEmail.get(key) ?? []), i]);
    });
    const conflictGroups: { email: string; indices: number[] }[] = [];
    let identicalDupes = 0;
    for (const [email, indices] of byEmail) {
      if (indices.length < 2) continue;
      const first = JSON.stringify(rows[indices[0]]);
      if (indices.every((i) => JSON.stringify(rows[i]) === first)) identicalDupes += indices.length - 1;
      else conflictGroups.push({ email, indices });
    }
    const missingEmail = rows.map((r, i) => i).filter((i) => !rows[i].email.trim());
    const invalidEmail = rows
      .map((r, i) => i)
      .filter((i) => rows[i].email.trim() && !isValidEmail(rows[i].email));
    return { byEmail, conflictGroups, identicalDupes, missingEmail, invalidEmail };
  }, [rows]);

  const unresolvedConflicts = analysis.conflictGroups.filter(
    (g) => conflictChoice[g.email] === undefined
  );

  const finalRows = (): ImportRow[] => {
    const seen = new Set<string>();
    const out: ImportRow[] = [];
    const conflictEmails = new Set(analysis.conflictGroups.map((g) => g.email));
    rows.forEach((row, i) => {
      const email = row.email.trim();
      if (!email) return;
      const key = email.toLowerCase();
      if (conflictEmails.has(key)) {
        const choice = conflictChoice[key];
        if (choice === "EXCLUDE" || choice !== i) return;
      } else {
        if (excluded.has(i)) return;
        if (seen.has(key)) return; // identical duplicate — first row wins
      }
      seen.add(key);
      out.push({ ...row, email });
    });
    return out;
  };

  // ── step 3 → 4 ────────────────────────────────────────────────
  const toDiff = async () => {
    setBusy(true);
    try {
      const d = await api<ImportDiff>(`/api/clients/${client.id}/import/diff`, {
        json: { rows: finalRows() },
      });
      setDiff(d);
      setIncludeChanged(new Set(d.changed.map((c) => c.contactId)));
      setStep("diff");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!diff) return;
    setBusy(true);
    try {
      const updates = diff.changed
        .filter((c) => includeChanged.has(c.contactId))
        .map((c) => ({ contactId: c.contactId, row: c.incoming }));
      const res = await api<{ created: number; updated: number }>(
        `/api/clients/${client.id}/import/commit`,
        { json: { creates: diff.news, updates } }
      );
      toast(`Imported ${res.created} new contact(s), updated ${res.updated}`, "success");
      onImported();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  const updateRowEmail = (i: number, email: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, email } : r)));

  const stepLabel: Record<Step, string> = {
    upload: "1 of 4 — Choose file",
    mapping: "2 of 4 — Map columns",
    review: "3 of 4 — Validate rows",
    diff: "4 of 4 — Review & confirm",
  };

  return (
    <Modal title={`Import supplier list (${stepLabel[step]})`} onClose={onClose} size="xwide">
      {step === "upload" && (
        <div
          className={`dropzone ${dragOver ? "over" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) acceptFile(f);
          }}
        >
          <h3>Drop the client&rsquo;s Excel or CSV file here</h3>
          <p>or click to browse. Extra header rows, merged cells, and trailing blanks are handled.</p>
          <p className="faint">
            Nothing is saved until the final confirmation step.
            {hasExisting && " Existing audience assignments are preserved on re-import."}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {step === "mapping" && wb && (
        <div className="stack">
          <div className="row wrap">
            <span className="pill gray">{fileName}</span>
            {wb.sheetNames.length > 1 && (
              <label className="row" style={{ gap: 6 }}>
                <span className="subtle">Sheet:</span>
                <select value={sheet} onChange={(e) => selectSheet(wb, e.target.value)}>
                  {wb.sheetNames.map((n) => (
                    <option key={n} value={n}>{n} ({wb.grids[n]?.length ?? 0} rows)</option>
                  ))}
                </select>
              </label>
            )}
            <label className="row" style={{ gap: 6 }}>
              <span className="subtle">Header row:</span>
              <select
                value={headerRow}
                onChange={(e) => {
                  const hr = Number(e.target.value);
                  setHeaderRow(hr);
                  setMapping(guessMapping(grid[hr] ?? []));
                }}
              >
                {grid.slice(0, 10).map((r, i) => (
                  <option key={i} value={i}>
                    Row {i + 1}: {r.filter(Boolean).slice(0, 4).join(" | ").slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid-2" style={{ gap: 10 }}>
            {FIELD_DEFS.map((f) => (
              <label key={f.key} className="field" style={{ marginBottom: 0 }}>
                <span>
                  {f.label} {f.required && <strong style={{ color: "var(--danger)" }}>*</strong>}
                </span>
                <select
                  value={mapping[f.key] ?? -1}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))
                  }
                >
                  <option value={-1}>— not mapped —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `(column ${i + 1})`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div>
            <h3>Preview — first 5 data rows as they will import</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>{FIELD_DEFS.map((f) => <th key={f.key}>{f.label}</th>)}</tr>
                </thead>
                <tbody>
                  {rowsFromGrid(grid, headerRow, mapping).slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {FIELD_DEFS.map((f) => (
                        <td key={f.key}>{r[f.key] || <span className="faint">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="modal-foot" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => setStep("upload")}>← Back</button>
            <button className="btn primary" disabled={mapping.email < 0} onClick={toReview}>
              {mapping.email < 0 ? "Map the Email column to continue" : "Continue →"}
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="stack">
          <div className="row wrap">
            <span className="pill gray">{rows.length} rows parsed</span>
            {analysis.identicalDupes > 0 && (
              <span className="pill blue">{analysis.identicalDupes} exact duplicate row(s) auto-collapsed</span>
            )}
            {analysis.conflictGroups.length > 0 && (
              <span className="pill amber">{analysis.conflictGroups.length} duplicate email conflict(s)</span>
            )}
            {analysis.invalidEmail.length > 0 && (
              <span className="pill red">{analysis.invalidEmail.length} invalid email(s)</span>
            )}
            {analysis.missingEmail.length > 0 && (
              <span className="pill red">{analysis.missingEmail.length} missing email(s) — auto-excluded</span>
            )}
          </div>

          {analysis.conflictGroups.length > 0 && (
            <div className="card" style={{ background: "var(--warn-soft)" }}>
              <h3>Same email, different details — choose which record wins</h3>
              {analysis.conflictGroups.map((g) => (
                <div key={g.email} style={{ marginBottom: 12 }}>
                  <div className="mono" style={{ marginBottom: 4 }}>{g.email}</div>
                  {g.indices.map((i) => (
                    <label key={i} className="checkbox-row" style={{ marginBottom: 2 }}>
                      <input
                        type="radio"
                        name={`conflict-${g.email}`}
                        checked={conflictChoice[g.email] === i}
                        onChange={() => setConflictChoice((c) => ({ ...c, [g.email]: i }))}
                      />
                      <span>
                        {rows[i].firstName} {rows[i].lastName} — {rows[i].company}
                        {rows[i].title && ` (${rows[i].title})`}
                      </span>
                    </label>
                  ))}
                  <label className="checkbox-row">
                    <input
                      type="radio"
                      name={`conflict-${g.email}`}
                      checked={conflictChoice[g.email] === "EXCLUDE"}
                      onChange={() => setConflictChoice((c) => ({ ...c, [g.email]: "EXCLUDE" }))}
                    />
                    <span className="subtle">Exclude this email entirely</span>
                  </label>
                </div>
              ))}
            </div>
          )}

          {(analysis.invalidEmail.length > 0 || analysis.missingEmail.length > 0) && (
            <div className="card">
              <h3>Fix or exclude flagged rows</h3>
              <p className="faint">
                Rows left invalid are imported but flagged, and blocked from sending until fixed.
                Rows with no email cannot be imported.
              </p>
              <div className="table-wrap" style={{ maxHeight: 240 }}>
                <table className="data">
                  <thead>
                    <tr><th>Company</th><th>Contact</th><th style={{ width: 280 }}>Email (editable)</th><th>Exclude</th></tr>
                  </thead>
                  <tbody>
                    {[...analysis.invalidEmail, ...analysis.missingEmail].map((i) => (
                      <tr key={i}>
                        <td>{rows[i].company}</td>
                        <td>{rows[i].firstName} {rows[i].lastName}</td>
                        <td>
                          <input
                            type="text"
                            style={{ width: "100%", borderColor: isValidEmail(rows[i].email) ? undefined : "var(--danger)" }}
                            value={rows[i].email}
                            onChange={(e) => updateRowEmail(i, e.target.value)}
                            placeholder="missing"
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={excluded.has(i)}
                            onChange={(e) =>
                              setExcluded((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(i); else n.delete(i);
                                return n;
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="modal-foot" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => setStep("mapping")}>← Back</button>
            <button
              className="btn primary"
              disabled={busy || unresolvedConflicts.length > 0}
              onClick={toDiff}
            >
              {unresolvedConflicts.length > 0
                ? `Resolve ${unresolvedConflicts.length} conflict(s) to continue`
                : "Continue →"}
            </button>
          </div>
        </div>
      )}

      {step === "diff" && diff && (
        <div className="stack">
          <div className="row wrap">
            <span className="pill green">{diff.news.length} new</span>
            <span className="pill blue">{diff.changed.length} changed</span>
            <span className="pill gray">{diff.unchangedCount} unchanged</span>
          </div>
          {hasExisting && (
            <p className="faint">
              Updates change contact details only — existing audience assignments are kept.
            </p>
          )}

          {diff.news.length > 0 && (
            <div>
              <h3>New contacts ({diff.news.length})</h3>
              <div className="table-wrap" style={{ maxHeight: 220 }}>
                <table className="data">
                  <thead><tr><th>Company</th><th>Contact</th><th>Email</th><th>Category</th></tr></thead>
                  <tbody>
                    {diff.news.map((r, i) => (
                      <tr key={i}>
                        <td>{r.company}</td>
                        <td>{r.firstName} {r.lastName}</td>
                        <td className="mono">{r.email}</td>
                        <td>{r.category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {diff.changed.length > 0 && (
            <div>
              <h3>Changed contacts ({diff.changed.length}) — untick any you don&rsquo;t want updated</h3>
              <div className="table-wrap" style={{ maxHeight: 260 }}>
                <table className="data">
                  <thead><tr><th style={{ width: 36 }}>Apply</th><th>Email</th><th>Changes</th></tr></thead>
                  <tbody>
                    {diff.changed.map((c) => (
                      <tr key={c.contactId}>
                        <td>
                          <input
                            type="checkbox"
                            checked={includeChanged.has(c.contactId)}
                            onChange={(e) =>
                              setIncludeChanged((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(c.contactId); else n.delete(c.contactId);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td className="mono">{c.email}</td>
                        <td>
                          {c.fields.map((f) => (
                            <div key={f}>
                              <span className="faint">{f}: </span>
                              <span className="diff-old">{c.existing[f] || "(empty)"}</span>{" "}
                              → <span className="diff-new">{c.incoming[f] || "(empty)"}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {diff.news.length === 0 && diff.changed.length === 0 && (
            <p className="subtle">Nothing to import — every row matches an existing contact exactly.</p>
          )}

          <div className="modal-foot" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => setStep("review")}>← Back</button>
            <button
              className="btn primary"
              disabled={busy || (diff.news.length === 0 && includeChanged.size === 0)}
              onClick={commit}
            >
              Import {diff.news.length} new
              {includeChanged.size > 0 && `, update ${includeChanged.size}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
