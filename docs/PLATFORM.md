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

## 6. Next up

1. Phase 7: storage abstraction, uploads, attachments in the composer,
   library page, avatars.
2. Phase 8: projects (instructions, files, chats), custom assistants, share
   links (read-only, revocable).
3. Phase 9 remainder: feature flags, maintenance mode, storage admin.
4. Phase 3 remainder: SMTP-backed verification and reset, optional Google
   sign-in, optional 2FA.
5. Phase 4 remainder: response branching, export of a single chat, pagination
   of very long histories.

Capabilities without a working backend (web search, deep research, image
generation, voice, code execution) are not shown in the UI until they are
implemented.
