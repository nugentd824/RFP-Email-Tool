"use client";

// Thin fetch wrapper for client components: JSON in/out, throws Error with the
// server's message so callers can toast it.
export async function api<T = unknown>(
  url: string,
  opts: Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit } = {}
): Promise<T> {
  const { json, ...rest } = opts;
  const init: RequestInit = { ...rest };
  if (json !== undefined) {
    init.method = init.method ?? "POST";
    init.headers = { "Content-Type": "application/json", ...(init.headers ?? {}) };
    init.body = JSON.stringify(json);
  }
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/signin";
    throw new Error("Not signed in");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}
