"use client";

import { useEffect, useState } from "react";
import type { ClientStatus, SendStatus } from "@/lib/types";

export function Modal({
  title,
  onClose,
  children,
  footer,
  size,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "wide" | "xwide";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ""}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// Confirmation gate for irreversible bulk actions: the user must type an
// exact phrase before the confirm button arms.
export function ConfirmTypedModal({
  title,
  phrase,
  description,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  phrase: string;
  description: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const armed = typed.trim() === phrase;

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? "danger" : "primary"}`}
            disabled={!armed}
            onClick={() => armed && onConfirm()}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack">
        <div>{description}</div>
        {children}
        <label className="field" style={{ marginBottom: 0 }}>
          <span>
            Type <strong className="mono">{phrase}</strong> to confirm
          </span>
          <input
            type="text"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={phrase}
          />
        </label>
      </div>
    </Modal>
  );
}

export function ClientStatusPill({ status }: { status: ClientStatus }) {
  const map: Record<ClientStatus, { cls: string; label: string }> = {
    SETUP: { cls: "gray", label: "Setup" },
    IN_PROGRESS: { cls: "blue", label: "In Progress" },
    COMPLETE: { cls: "green", label: "Complete" },
  };
  const m = map[status] ?? map.SETUP;
  return <span className={`pill ${m.cls}`}>{m.label}</span>;
}

export function SendStatusPill({ status }: { status: SendStatus }) {
  const map: Record<SendStatus, { cls: string; label: string }> = {
    NOT_SENT: { cls: "gray", label: "Not Sent" },
    PARTIAL: { cls: "amber", label: "Partially Sent" },
    SENT: { cls: "green", label: "Sent" },
  };
  const m = map[status];
  return <span className={`pill ${m.cls}`}>{m.label}</span>;
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
