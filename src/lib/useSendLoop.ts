"use client";

import { useRef, useState } from "react";
import { api } from "./clientApi";

export type SendItem = { contactId: string; audienceId: string; label: string };

export type SendProgress = {
  running: boolean;
  total: number;
  done: number;
  ok: number;
  fail: number;
  current: string | null;
};

const IDLE: SendProgress = { running: false, total: 0, done: 0, ok: 0, fail: 0, current: null };

// The browser drives the send loop: one API call per recipient with a delay
// between messages (throttle for spam-filter friendliness). This also keeps
// each serverless invocation short, shows live progress, and lets the user
// cancel between messages. Every attempt is logged server-side regardless.
export function useSendLoop() {
  const [progress, setProgress] = useState<SendProgress>(IDLE);
  const cancelRef = useRef(false);

  const start = async (
    items: SendItem[],
    delayMs: number,
    onDone: (ok: number, fail: number, cancelled: boolean) => void
  ) => {
    cancelRef.current = false;
    let ok = 0;
    let fail = 0;
    setProgress({ running: true, total: items.length, done: 0, ok: 0, fail: 0, current: null });
    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;
      const item = items[i];
      setProgress((p) => ({ ...p, current: item.label }));
      try {
        await api("/api/send", { json: { audienceId: item.audienceId, contactId: item.contactId } });
        ok++;
      } catch {
        fail++;
      }
      setProgress((p) => ({ ...p, done: i + 1, ok, fail }));
      if (i < items.length - 1 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    const cancelled = cancelRef.current;
    setProgress((p) => ({ ...p, running: false, current: null }));
    onDone(ok, fail, cancelled);
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  const reset = () => setProgress(IDLE);

  return { progress, start, cancel, reset };
}
