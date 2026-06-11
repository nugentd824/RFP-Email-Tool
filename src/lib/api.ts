import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireAuth(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.email) throw new ApiError(401, "Not signed in");
  if (session.error === "RefreshTokenError")
    throw new ApiError(401, "Your Microsoft sign-in expired. Please sign out and back in.");
  return session;
}

type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (req: Request, params: Record<string, string>, session: Session) => Promise<NextResponse>;

// Wraps a route handler with auth + uniform error responses.
export function guarded(fn: Handler) {
  return async (req: Request, ctx: RouteContext): Promise<NextResponse> => {
    try {
      const session = await requireAuth();
      const params = ctx?.params ? await ctx.params : {};
      return await fn(req, params, session);
    } catch (e) {
      if (e instanceof ApiError)
        return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      const msg = e instanceof Error ? e.message : "Unexpected server error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  };
}
