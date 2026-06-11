"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export function TopBar() {
  const [email, setEmail] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setEmail(s?.user?.email ?? null))
      .catch(() => {});
  }, [pathname]);

  if (pathname === "/signin") return null;

  return (
    <header className="topbar">
      <a href="/" className="brand">
        Pre-RFP Comms
      </a>
      <a href="/" style={{ color: "#b8c7d6", fontSize: 13 }}>
        Dashboard
      </a>
      <span className="spacer" />
      {email && (
        <>
          <span className="user-email">{email}</span>
          <button onClick={() => signOut({ callbackUrl: "/signin" })}>Sign out</button>
        </>
      )}
    </header>
  );
}
