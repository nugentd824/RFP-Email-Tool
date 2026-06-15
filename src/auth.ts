import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const SCOPES = "openid profile email offline_access User.Read Mail.Send";

function tenantTokenEndpoint(): string {
  // AUTH_MICROSOFT_ENTRA_ID_ISSUER looks like https://login.microsoftonline.com/<tenant>/v2.0
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "";
  return issuer.replace(/\/v2\.0\/?$/, "") + "/oauth2/v2.0/token";
}

function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(tenantTokenEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
        client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
        scope: SCOPES,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description ?? "Token refresh failed");
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  logger: {
    // Surface the underlying cause of the generic "Configuration" error page
    // in the Vercel function logs (name + message + nested cause).
    error(error) {
      const cause = (error as { cause?: unknown }).cause;
      // TEMP: include the env probe (names only, never values) on every error
      // so it always lines up with the failing request, warm starts included.
      const authKeys = Object.keys(process.env).filter((k) => /^(AUTH_|NEXTAUTH_)/i.test(k));
      console.error(
        "[auth] error:", error.name, "-", error.message, cause ?? "",
        "| AUTH_SECRET present:", !!process.env.AUTH_SECRET,
        "| ISSUER:", JSON.stringify(process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER),
        "| CLIENT_ID len:", (process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "").length,
        "| CLIENT_SECRET len:", (process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "").length,
        "| AUTH_* keys:", authKeys,
      );
    },
  },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: { params: { scope: SCOPES } },
    }),
  ],
  callbacks: {
    signIn({ user }) {
      const allowed = allowedEmails();
      const email = user.email?.toLowerCase() ?? "";
      // Default-deny: an empty allow-list locks everyone out rather than
      // exposing client supplier data on a public URL.
      return allowed.length > 0 && allowed.includes(email);
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }
      // Refresh 5 minutes before expiry so a long send loop never hits a 401.
      const expiresAt = (token.expiresAt as number | undefined) ?? 0;
      if (Date.now() < (expiresAt - 300) * 1000) return token;
      if (!token.refreshToken) return { ...token, error: "RefreshTokenError" };
      return refreshAccessToken(token);
    },
    session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      return session;
    },
  },
});
