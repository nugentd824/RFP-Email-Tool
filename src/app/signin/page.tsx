"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function SignInInner() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <div className="signin-wrap">
      <div className="card signin-card">
        <h1>Pre-RFP Comms</h1>
        <p className="subtle" style={{ marginBottom: 24 }}>
          Supplier communication manager. Sign in with the Microsoft 365 account you send
          mail from — the same sign-in authorizes sending.
        </p>
        {error && (
          <p className="pill red" style={{ marginBottom: 16, padding: "6px 14px" }}>
            {error === "AccessDenied"
              ? "This account isn't on the allow-list (ALLOWED_EMAILS)."
              : `Sign-in failed (${error}). Check the Entra configuration and try again.`}
          </p>
        )}
        <button
          className="btn primary"
          style={{ width: "100%", justifyContent: "center", padding: "10px" }}
          onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/" })}
        >
          Sign in with Microsoft 365
        </button>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}
