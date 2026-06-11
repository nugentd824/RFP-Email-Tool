# Pre-RFP Comms

A single-user web app for managing and sending pre-RFP communication emails to supplier
contacts on behalf of multiple clients in parallel. Each client engagement gets a
workspace with a supplier list (imported from Excel), two renameable audiences, one
rich-text email template per audience (with attachments and merge fields), a gated
Review & Send flow, and a full send log for client reporting.

Email goes out through **your own Microsoft 365 mailbox** via the Microsoft Graph API —
you sign in with OAuth, no password is ever stored, and every recipient gets an
individual email (no shared CC/BCC).

## Stack

- **Next.js 15 + TypeScript** — UI and API in one app, deployed on Vercel
- **Postgres + Prisma** — all data including attachments lives in one database
- **Auth.js (NextAuth v5)** with Microsoft Entra ID — app login *is* the mailbox sign-in;
  an `ALLOWED_EMAILS` allow-list controls who can get in
- **SheetJS** for .xlsx/.csv import/export (parsed in the browser), **Tiptap** for rich text

## One-time setup

### 1. Database (≈2 min)

Any Postgres works. Easiest: in your Vercel project → **Storage** tab → create a
**Neon Postgres** database — Vercel injects `DATABASE_URL` automatically. (Or create a
free database at neon.tech and copy the pooled connection string.)

Create the tables once, from any machine:

```bash
npm install
DATABASE_URL="postgresql://…" npx prisma db push
```

### 2. Microsoft Entra app registration (≈5 min)

This is what lets the app sign you in and send mail as you. In the
[Azure portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations**
→ **New registration**:

1. Name: `Pre-RFP Comms`. Supported account types: **Accounts in this organizational
   directory only**.
2. Redirect URI: platform **Web**, value
   `https://YOUR-APP.vercel.app/api/auth/callback/microsoft-entra-id`
   (after deploying you'll know the exact hostname — you can add it later, plus
   `http://localhost:3000/api/auth/callback/microsoft-entra-id` for local dev).
3. After creating, from the **Overview** page copy:
   - **Application (client) ID** → `AUTH_MICROSOFT_ENTRA_ID_ID`
   - **Directory (tenant) ID** → into
     `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0`
4. **Certificates & secrets** → **New client secret** → copy the secret **Value**
   (not the ID) → `AUTH_MICROSOFT_ENTRA_ID_SECRET`. Note the expiry; you'll rotate it.
5. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**:
   `Mail.Send` and `User.Read` (`openid`, `profile`, `email`, `offline_access` are
   requested at sign-in automatically). These are user-consentable in most tenants; if
   yours requires admin consent, ask IT to click **Grant admin consent** on this page.

> If your firm restricts app registrations entirely, IT can create this registration
> from the steps above in a few minutes — the app only ever requests delegated
> (act-as-you) permissions, never application-wide ones.

### 3. Deploy to Vercel

Import this repo in Vercel — the app lives at the repo root, so no Root Directory
setting is needed. Then set the environment variables (see `.env.example`):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Postgres pooled connection string (auto if using Vercel Storage) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Client secret value |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| `ALLOWED_EMAILS` | Comma-separated sign-in allow-list (your work email) |

Deploy, then add the real callback URL (step 2.2) to the Entra app registration.
Adding a colleague later = adding their email to `ALLOWED_EMAILS`.

### Local development

```bash
cp .env.example .env   # fill in values; uncomment AUTH_URL
npm install
npm run db:push        # once
npm run dev            # http://localhost:3000
```

## Using the app

1. **Dashboard** → *Add New Client*. Every client gets two audiences (rename them in
   the **Details** tab, e.g. "Incumbent Suppliers" / "New Suppliers", and set target
   send dates and an optional record-keeping BCC there too).
2. **Supplier List** → *Import Excel/CSV*. The wizard auto-detects the header row
   (banner rows and merged cells tolerated), lets you confirm the column mapping with a
   5-row preview, flags invalid/missing emails for fix-or-exclude, resolves duplicate
   emails with conflicting details, and on **re-import** shows a new/changed/unchanged
   diff — audience assignments are always preserved (matching is by email address).
   Assign audiences with bulk actions (shift-click selects ranges) or the per-row
   dropdown. The **⧉** action duplicates a contact into the other audience for the rare
   supplier that must receive both communications.
3. **Communications** → write each audience's subject and body (merge fields:
   `{{FirstName}}`, `{{LastName}}`, `{{SupplierCompany}}`, `{{ClientName}}`, plus
   `{{Title}}` and `{{Category}}`), upload attachments (≤4 MB per file), or *Copy
   from…* a previous engagement's template. Every content change bumps the template
   version; editing after a partial send warns you first.
4. **Review & Send** → the checklist blocks sending until recipients are assigned,
   emails are valid, subject/body are non-empty, and attachments exist (or you confirm
   "no attachment intended"). Preview any recipient's exact rendered email, send a test
   to yourself, then send to the audience (or a subset) — typing the audience name is
   required to fire a bulk send. Sends are throttled (default 1 email / 2 s) with live
   progress and cancel; keep the tab open during a send.
5. **Tracking** → per-contact log with timestamp (US Eastern), audience, template
   version, status, and error; one-click *Retry failed*; export to CSV/Excel for the
   client audit trail.

## Notes & limits (v1)

- **Bounces** aren't detectable via Graph — they arrive as NDRs in your own inbox.
  "Failed" in the log means Graph rejected the send (auth, throttling, bad address).
- **Attachment size**: ≤4 MB per file (Vercel request cap), warning above 10 MB total
  per template, hard stop at 25 MB.
- **Throttle**: Exchange Online allows ~30 messages/minute; the default 2 s delay stays
  comfortably under it.
- **Sending runs in the browser tab** (one API call per email) — closing the tab
  mid-send stops the campaign cleanly; everything already sent is logged, and the
  Review & Send tab's "Unsent" selection picks up exactly where you left off.
- Single user by design; the schema and allow-list are ready for a colleague login later.
- Out of scope per spec: open/click tracking, automated follow-ups, roles/permissions,
  reply handling.
