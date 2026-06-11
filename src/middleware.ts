export { auth as middleware } from "@/auth";

export const config = {
  // Protect all pages; API routes guard themselves (they must return 401 JSON,
  // not a redirect). Static assets and the auth endpoints stay open.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|signin).*)"],
};
