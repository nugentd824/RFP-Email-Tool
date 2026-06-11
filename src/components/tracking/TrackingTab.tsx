"use client";

import { useMemo, useState } from "react";
import type { ClientDetail, SendLogDTO } from "@/lib/types";
import { fmtET } from "@/lib/format";
import { exportCsv, exportXlsx } from "@/lib/excel";
import { EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSendLoop, type SendItem } from "@/lib/useSendLoop";

export function TrackingTab({
  client,
  logs,
  onActivity,
}: {
  client: ClientDetail;
  logs: SendLogDTO[];
  onActivity: () => void;
}) {
  const toast = useToast();
  const { progress, start, cancel } = useSendLoop();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [audienceFilter, setAudienceFilter] = useState("ALL");
  const [showTests, setShowTests] = useState(false);

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (!showTests && l.isTest) return false;
        if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
        if (audienceFilter !== "ALL" && l.audienceId !== audienceFilter) return false;
        return true;
      }),
    [logs, statusFilter, audienceFilter, showTests]
  );

  // Contacts whose LATEST real attempt per (contact, audience) failed —
  // these are what "Retry failed" re-sends.
  const retryItems: SendItem[] = useMemo(() => {
    const latest = new Map<string, SendLogDTO>();
    for (const l of logs) {
      if (l.isTest || !l.contactId || !l.audienceId) continue;
      const key = `${l.contactId}|${l.audienceId}`;
      if (!latest.has(key)) latest.set(key, l); // newest-first ordering
    }
    return [...latest.values()]
      .filter((l) => l.status === "FAILED")
      .map((l) => ({ contactId: l.contactId!, audienceId: l.audienceId!, label: l.toEmail }));
  }, [logs]);

  const retryFailed = () => {
    start(retryItems, 2000, (ok, fail, cancelled) => {
      toast(
        `Retry finished: ${ok} sent, ${fail} still failing${cancelled ? " (cancelled)" : ""}`,
        fail ? "error" : "success"
      );
      onActivity();
    });
  };

  const exportRows = () =>
    filtered.map((l) => [
      fmtET(l.sentAt),
      l.contactName,
      l.toEmail,
      l.audienceLabel,
      l.subject,
      `v${l.templateVersion}`,
      l.isTest ? "TEST" : l.status,
      l.error,
    ]);
  const EXPORT_HEADERS = [
    "Sent At (ET)", "Contact", "Email", "Audience", "Subject", "Template Version", "Status", "Error",
  ];
  const exportName = `${client.name.replace(/[^\w]+/g, "-")}-send-log`;

  if (logs.length === 0)
    return (
      <EmptyState
        title="Nothing sent yet"
        hint="Once you send (or test) a communication, every individual email lands here with its timestamp, template version, and delivery result."
      />
    );

  return (
    <div className="stack">
      <div className="row wrap between">
        <div className="row wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
          </select>
          <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}>
            <option value="ALL">All audiences</option>
            {client.audiences.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <label className="checkbox-row">
            <input type="checkbox" checked={showTests} onChange={(e) => setShowTests(e.target.checked)} />
            <span>Show test sends</span>
          </label>
        </div>
        <div className="row">
          {retryItems.length > 0 && (
            <button className="btn primary" disabled={progress.running} onClick={retryFailed}>
              Retry {retryItems.length} failed
            </button>
          )}
          <button className="btn" onClick={() => exportCsv(`${exportName}.csv`, EXPORT_HEADERS, exportRows())}>
            Export CSV
          </button>
          <button className="btn" onClick={() => exportXlsx(`${exportName}.xlsx`, "Send Log", EXPORT_HEADERS, exportRows())}>
            Export Excel
          </button>
        </div>
      </div>

      {(progress.running || progress.total > 0) && (
        <div className="row" style={{ gap: 12 }}>
          <div className="progress-track" style={{ flex: 1 }}>
            <div
              className="progress-fill"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="subtle">
            {progress.running
              ? `Retrying ${progress.done + 1}/${progress.total}…`
              : `Done: ${progress.ok} ok, ${progress.fail} failed`}
          </span>
          {progress.running && <button className="btn sm" onClick={cancel}>Cancel</button>}
        </div>
      )}

      <div className="table-wrap" style={{ maxHeight: "65vh" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Sent (ET)</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Audience</th>
              <th>Subject</th>
              <th>Ver.</th>
              <th>Status</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtET(l.sentAt)}</td>
                <td>{l.contactName}</td>
                <td className="mono">{l.toEmail}</td>
                <td>{l.audienceLabel}</td>
                <td className="subtle" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.subject}
                </td>
                <td>v{l.templateVersion}</td>
                <td>
                  {l.isTest ? (
                    <span className="pill blue">test</span>
                  ) : l.status === "SENT" ? (
                    <span className="pill green">sent</span>
                  ) : (
                    <span className="pill red">failed</span>
                  )}
                </td>
                <td className="faint" style={{ maxWidth: 280 }}>{l.error}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="subtle" style={{ textAlign: "center", padding: 24 }}>
                  No log entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="faint">
        {filtered.length} entries shown. Bounces aren&rsquo;t detectable via Microsoft Graph in
        v1 — they arrive as non-delivery reports in your own inbox.
      </p>
    </div>
  );
}
