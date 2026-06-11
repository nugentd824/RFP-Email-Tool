"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/clientApi";
import type { ClientDetail, ContactDTO, SendLogDTO } from "@/lib/types";
import { ClientStatusPill } from "@/components/ui";
import { useToast } from "@/components/toast";
import { SuppliersTab } from "@/components/suppliers/SuppliersTab";
import { CommunicationsTab } from "@/components/comms/CommunicationsTab";
import { ReviewSendTab } from "@/components/send/ReviewSendTab";
import { TrackingTab } from "@/components/tracking/TrackingTab";
import { DetailsTab } from "@/components/details/DetailsTab";

type TabKey = "suppliers" | "comms" | "send" | "tracking" | "details";

export default function ClientWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [contacts, setContacts] = useState<ContactDTO[]>([]);
  const [logs, setLogs] = useState<SendLogDTO[]>([]);
  const [tab, setTab] = useState<TabKey>("suppliers");
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useToast();

  const refreshDetail = useCallback(
    () =>
      api<ClientDetail>(`/api/clients/${id}`)
        .then(setDetail)
        .catch((e) => setLoadError((e as Error).message)),
    [id]
  );
  const refreshContacts = useCallback(
    () =>
      api<ContactDTO[]>(`/api/clients/${id}/contacts`)
        .then(setContacts)
        .catch((e) => toast((e as Error).message, "error")),
    [id, toast]
  );
  const refreshLogs = useCallback(
    () =>
      api<SendLogDTO[]>(`/api/clients/${id}/logs`)
        .then(setLogs)
        .catch((e) => toast((e as Error).message, "error")),
    [id, toast]
  );

  useEffect(() => {
    refreshDetail();
    refreshContacts();
    refreshLogs();
  }, [refreshDetail, refreshContacts, refreshLogs]);

  if (loadError)
    return (
      <div className="empty-state">
        <h3>Could not load client</h3>
        <p>{loadError}</p>
        <a href="/">← Back to dashboard</a>
      </div>
    );
  if (!detail) return <p className="subtle">Loading…</p>;

  const unassigned = contacts.filter((c) => c.audienceId === null).length;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "suppliers", label: `Supplier List (${contacts.length})` },
    { key: "comms", label: "Communications" },
    { key: "send", label: "Review & Send" },
    { key: "tracking", label: `Tracking (${logs.filter((l) => !l.isTest).length})` },
    { key: "details", label: "Details" },
  ];

  return (
    <div>
      <a href="/" className="subtle">
        ← Dashboard
      </a>
      <div className="row between" style={{ marginTop: 6 }}>
        <div className="row">
          <h1 style={{ marginBottom: 0 }}>{detail.name}</h1>
          <ClientStatusPill status={detail.status} />
        </div>
        {unassigned > 0 && <span className="pill amber">{unassigned} unassigned</span>}
      </div>
      {detail.engagement && <div className="subtle">{detail.engagement}</div>}

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "suppliers" && (
        <SuppliersTab
          client={detail}
          contacts={contacts}
          onChanged={() => {
            refreshContacts();
            refreshDetail();
          }}
        />
      )}
      {tab === "comms" && (
        <CommunicationsTab client={detail} onChanged={refreshDetail} />
      )}
      {tab === "send" && (
        <ReviewSendTab
          client={detail}
          contacts={contacts}
          logs={logs}
          onActivity={() => {
            refreshLogs();
            refreshDetail();
          }}
        />
      )}
      {tab === "tracking" && (
        <TrackingTab
          client={detail}
          logs={logs}
          onActivity={() => {
            refreshLogs();
            refreshDetail();
          }}
        />
      )}
      {tab === "details" && (
        <DetailsTab client={detail} onChanged={refreshDetail} />
      )}
    </div>
  );
}
