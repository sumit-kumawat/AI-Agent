# Conzex AI platform: audit and rebuild roadmap

This is the working record for turning Conzex AI into a complete
ChatGPT-style platform. It lists what exists, what is being replaced, and
what is done, in progress, or still to do. Each phase is only marked done
after it is tested (typecheck, lint, build, smoke, and the e2e suites).

## 1. Audit (November 2026)

### Stack (kept, with reasons)

| Layer | Today | Decision |
| --- | --- | --- |
| Web framework | Next.js 16 App Router, React 19, TypeScript, Turbopack, standalone output | Keep: server components, route handlers and streaming fit a chat product |
| Styling | Tailwind 4, shadcn/radix primitives, lucide icons | Keep; design tokens are rebuilt (light, dark, system, accents, font size, density) |
| Database | SQLite (better-sqlite3) with Drizzle; migrations by `PRAGMA user_version` | Keep: single-file, transactional, FTS5 for search. Migrations stay additive so existing data is preserved |
| Auth | Auth.js v5 credentials, JWT re-checked against the DB on each request, session version for sign-out-everywhere, forced first-login password change | Keep and extend (profile, security, sessions) |
| AI | AI SDK v7 with an OpenAI-compatible client for Ollama | Keep the SDK; add a provider registry (OpenAI, Anthropic, Gemini, OpenAI-compatible, Ollama) |
| Popups | Global `FeedbackProvider` (confirm, prompt, notify) | Keep; no browser dialogs anywhere |
| Admin | Users, usage, agents and models, settings, conversation audit, audit log | Keep and extend; conversation content access becomes reason-gated and audited |
| IDE | Admin-only workspaces, Monaco, terminals (`/ide`) | Keep as an admin tool; outside this rebuild's scope |

### Existing data model

`users`, `conversations`, `messages`, `usage_events`, `rate_limit_events`,
`admin_audit_log`, `agent_config`, `model_config`, `settings`, `workspaces`.
All new tables reference these with foreign keys; nothing is dropped.

### Problems found

- The chat UI is a single sidebar list: no search, pinning, archive, projects,
  assistants, library, settings, or profile menu beyond sign-out.
- No user preferences, custom instructions, memory, or appearance settings; the
  system prompt is a fixed string.
- Messages cannot be edited, rated, or continued; no timestamps.
- No data export; account deletion exists only as an API.
- Light-only theme (a temporary decision now reversed: light, dark, system).
- Admins can read any conversation without stating a reason.
- Only one AI provider (Ollama).
- No file uploads, sharing, projects, or assistants.

## 2. Target architecture

- **Routes**: `/chat` (new chat), `/chat/[id]`, `/c/temporary` style temporary
  chats via `?temporary=1`, `/library`, `/projects/[id]`, `/gpts`,
  `/gpts/[id]`, `/share/[token]` (public read-only), `/help`, `/admin/*`,
  `/ide/*`. Settings open as a modal over any page (`#settings/<tab>`).
- **Services** (`lib/`): conversations, messages and search (FTS5), memory,
  preferences and prompt composition, providers and models, storage, projects,
  assistants, sharing, usage, audit.
- **APIs** (`app/api/`): one route group per service; every handler checks the
  session and scopes queries by `user_id`.

## 3. Roadmap and status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Audit, architecture, migration plan (this document) | Done |
| 2 | New shell: sidebar (new chat, search, pinned, history by date, per-chat menu and right-click), profile menu, settings modal, help page, toasts, light/dark/system theme, accents, text size, density | Done for the sections that have backends; Projects, Assistants and Library entries arrive with phases 7–8 |
| 3 | Accounts: name, password change, log out everywhere, export, account deletion (done). Avatar upload (needs phase 7 storage), email verification and password reset (need SMTP), optional Google sign-in and 2FA | Partly done |
| 4 | Conversations: pin, archive and restore, rename, delete, search titles and message text (FTS5), bulk archive, restore and delete, temporary chats, edit and resend, feedback, continue, timestamps, per-chat model | Done. Remaining: response branching (keeping alternate replies), export of a single chat, pagination of very long histories |
| 5 | AI engine: provider registry, encrypted keys, model catalog, health, usage and cost, fallback | Done |
| 6 | Memory and personalization: explicit "remember" memories with de-duplication, management (add, edit, delete, delete all), reference saved memories and chat history toggles, custom instructions, personality, response length, language | Done |
| 7 | Library and storage: uploads with validation and quotas, attachments in chat, previews, downloads | Planned |
| 8 | Projects, custom assistants, sharing links | Planned |
| 9 | Admin: reason-gated, audited conversation access, title-only admin search, and provider admin (done); storage admin, feature flags, maintenance mode | Partly done |
| 10 | Stabilization: full e2e pass, security review, docs | Ongoing per phase |

## 4. What changed in release 1 (phases 1, 2, 4, 6 and parts of 3 and 9)

- **Migration 5** (additive): `conversations.pinned_at`, `archived_at`,
  `temporary`; `messages.feedback`, `meta`; new `memories` and
  `user_preferences` tables; `messages_fts` full-text index with triggers,
  backfilled from existing messages.
- **APIs**: `/api/conversations` (archived list, temporary create),
  `/api/conversations/[id]` (rename, pin, archive), `/api/conversations/bulk`,
  `/api/search`, `/api/messages/[id]/feedback`, `/api/preferences`,
  `/api/memories`, `/api/memories/[id]`, `/api/account/export`,
  `/api/account/profile`, `/api/account/sessions`. New routes use
  `lib/api.ts`: session check, same-origin check on writes, zod validation.
- **Prompting**: `lib/prompt.ts` builds the system prompt from preferences,
  memories and recent chat titles. User text is fenced so it is treated as
  information, not as new rules.
- **Memory** is only written on an explicit request ("Remember that …") or
  from Settings, never in temporary chats, and the reply shows
  "Memory updated".
- **Admin privacy**: reading a conversation requires a written reason; the
  audit entry (`conversation.content_access`) grants that admin 30 minutes of
  access. Flag and delete actions check the grant.
- **Tests**: `npm run e2e:platform` (31 checks) plus updated chat, admin,
  IDE and smoke suites.

## 5. What changed in the provider release (phase 5)

- **Migration 6** (additive): `conversations.provider_id`; `usage_events.provider_id`
  and `cost_micro`; new `providers` and `provider_models` tables. Ollama is
  seeded enabled. OpenAI, Anthropic and Google Gemini are seeded off.
- **Keys** are AES-256-GCM encrypted (`SECRETS_KEY`, or `AUTH_SECRET` when that
  is unset). The browser only ever sees a four-character hint. Audit entries
  record that a key changed, never the key.
- **Admin → Providers**: name, base URL, enable, save or remove a key, check
  the connection, enable individual models and set prices, choose a default
  and a fallback, and add an OpenAI-compatible provider. A check that fails
  stays failed. Cloud models are offered to members only after a check
  succeeds and an admin has enabled them.
- **Consent**: cloud models stay off until the member allows them. The picker
  asks first, and `/api/chat` returns 403 before it writes history.
- **Fallback** applies on the next message when the chosen provider is already
  known to be down. The reply says which model answered. A failure mid-stream
  does not switch the current response.
- **Usage** stores the provider and an estimated cost from public list prices.
  Ollama is $0. Models without a price show as —.
- Ollama remains the local default. Installing and disabling local models
  stays on Agents & models.

## 6. What changed in the business platform release

CONZEX no longer depends on WHMCS. Website, customer portal, billing and
requests are part of this app.

- **Design**: Inter, the light (`#FFFFFF`, sidebar `#F7F7F8`) and dark
  (`#212121`, sidebar `#171717`) palettes, accent `#10A37F`. The accent and
  `#8E8EA0` fail WCAG AA as text on white, so text uses `#6E6E80` and light
  primary buttons use `#0B7A5F`; `#10A37F` stays for marks, focus rings and
  dark mode.
- **Website** (`app/(site)`): home, domains (search and transfer), web,
  WordPress, builder, cloud, VPS, dedicated, business hosting, email, SSL,
  website security, backup, four solutions pages, CONZEX AI, FAQ, support and
  about. The copy comes from the old WHMCS addon (`lib/site/pages.ts`). Product
  pages list plans from the catalogue, and say "quoted on request" when there
  are none. Prices show in the visitor's currency (INR or USD).
- **Migration 7** (additive): `billing_profiles`, `products`, `product_prices`,
  `services`, `invoices`, `invoice_items`, `payments`, `projects`,
  `project_updates`, `proposals`. Amounts are stored in paise or cents.
- **Billing** (`lib/billing`): orders create a pending service and an invoice
  (numbered `CZX-YEAR-00001`, configurable GST). Paying activates the service
  and sets its next due date. An AI plan sets the member's plan and token quota
  while it is paid. Renewal invoices are issued hourly (`instrumentation.ts`),
  ahead of the due date, once per period. A requested cancellation ends the
  service at the end of the paid term.
- **Razorpay**: keys are saved encrypted under Admin → Billing → Payments &
  tax. Checkout is verified with the order signature and the webhook
  (`/api/billing/razorpay/webhook`) with the webhook secret. Payment is applied
  once, and only when the amount and currency match the invoice. Without keys,
  invoices say online payment is not set up, and admins can record bank
  transfers.
- **Portal** (`/portal`): overview, services (with cancellation), invoices
  (print or save as PDF, pay), requests and billing details.
- **Requests** replace the WHMCS projects addon. Customers send a request; staff
  reply, keep internal notes, change status and send a proposal. Accepting a
  proposal issues an invoice; paying it moves the request to In progress.
- **Domains**: availability is looked up live over RDAP. No registrar is
  connected, so registering or transferring opens a request.
- **Admin**: Billing (overview, invoices, services, plans and prices, payments
  and tax) and Requests. Every change is audited; secrets are never logged.
- **Tests**: `npm run e2e:billing` covers the website, ordering with GST,
  signed and forged webhooks and checkout callbacks, replay safety, invoice
  isolation between customers, and the request to proposal to invoice flow.

## 7. Needs a provider before it can work

| Capability | What is missing |
| --- | --- |
| Online card and UPI payment | Razorpay key ID, key secret and webhook secret (Admin → Billing → Payments & tax) |
| Domain registration and transfer | A registrar API. Until then these go through a request |
| Email verification, password reset, invoice emails | SMTP settings (not built yet) |
| Google sign-in | Google OAuth client (not built yet) |
| Image, GIF and video generation, voice, web search and research | Provider integrations (not built yet; not shown in the UI) |

## 8. Next up

1. Remove the separate local WHMCS install once its removal is confirmed.
2. Phase 7: storage, uploads, attachments in the composer, library page,
   avatars; document export (PDF, DOCX, XLSX, CSV, PPTX, TXT, MD).
3. Phase 3 remainder: SMTP settings in admin, email verification, password
   reset, invoice and renewal emails, optional Google sign-in and 2FA.
4. Generation and research: image, GIF and video generation, web search with
   real citations, voice, each behind a configured provider.
5. Phase 8: projects in chat, custom assistants, share links.
6. Settings modal tabs for billing, notifications and connected providers;
   phase 9 remainder (feature flags, maintenance mode, storage admin); phase 4
   remainder.

Capabilities without a working backend are not shown in the UI until they are
implemented.
