# xAI platform: audit and rebuild roadmap

This is the working record for turning xAI into a complete
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
| IDE | Workspaces, Monaco, assistant for plans with the IDE; terminals for admins (`/ide`) | Per-user ownership and storage quotas |

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

## 6. Separation, attachments and Deep Research release

**This repository is the AI application only.** The hosting website, customer
portal, billing, requests and domain lookup that were briefly added here are
removed; the hosting business belongs in its own WHMCS installation, which
shares no code, configuration, database or dependencies with this app. The
removed code is kept at tag `pre-separation-20261109`.

- **Migration 8** drops the empty business tables that migration 7 created
  (migration 7 is now a no-op) and deletes the billing settings. `/` sends
  visitors to sign-in or to chat.
- **Design**: Inter, light (`#FFFFFF`, sidebar `#F7F7F8`) and dark (`#212121`,
  sidebar `#171717`) palettes, accent `#10A37F` (text uses `#6E6E80` and light
  primary buttons `#0B7A5F` to pass WCAG AA). Promotional credits, the logo in
  the chat sidebar, starter suggestions and duplicate headings are gone.
- **Sidebar**: always present on desktop. Expanded it shows icons and labels;
  collapsed it is a 56 px icon rail with tooltips. The state is kept in a
  cookie, so the server renders it correctly with no flash. ⌘/Ctrl+Shift+S
  toggles it. Phones use a sheet.

### Attachments

- **Types**: PDF, Word (.docx), Excel (.xlsx), CSV/TSV, text and Markdown,
  source code, and PNG/JPEG/GIF/WebP images. Up to 10 files per message, 20 MB
  each (10 MB for images), 500 MB per user.
- **Validation** happens on the server: file type by extension plus content
  (image magic bytes, `%PDF-` header, ZIP structure for Office files with a
  limit on uncompressed size, strict UTF-8 for text). Parsing has a 30-second
  limit. Password-protected or damaged files are refused with a reason. Scanned
  PDFs without text are accepted with a warning.
- **Storage**: `DATA_DIR/uploads/<user>/<id>`, named by id only. Table
  `attachments` (migration 9) and `attachment_chunks` with an FTS5 index.
  Downloads are owner-only, `nosniff`, sandboxed, and anything that is not an
  image downloads instead of opening inline.
- **Composer**: paperclip, drag and drop, and paste. Every file uploads
  immediately with a progress bar and can be removed or replaced. Sending
  waits for uploads and is blocked while a file has failed or an image is
  attached to a model that cannot read images (vision support comes from
  Ollama's reported capabilities; the model list marks "Images").
- **Use in chat**: each user message carries its files, so edits and
  regenerations keep them and reloads show them. Small files go to the model
  whole. Long ones contribute the sections that match the question (or an
  even spread for summaries), within 12,000 characters for local models and
  60,000 for cloud ones, and the reply says "answered from N of M sections".
  Images from the last messages are re-sent to vision models.
- **Retention**: unsent uploads are deleted after 24 hours, and files of
  deleted chats and accounts are removed (hourly sweep in `instrumentation.ts`
  plus immediate clean-up on delete).

### Deep Research

- **Sources** (Admin → Research): Wikipedia (no key, on by default), a
  self-hosted SearXNG, Tavily and Brave Search (keys encrypted). "Test sources"
  runs a real query against each. The composer's Deep Research button is
  disabled with the reason when no configured source answers.
- **Run**: the chosen model plans 3–4 queries. Each source is searched one
  request at a time; results are deduplicated across queries and filtered for
  relevance. Pages are then read in full (Wikipedia articles through its API,
  other pages through a fetcher that refuses private and loopback addresses at
  connect time, re-checks every redirect, and caps size and time). When a page
  cannot be opened, only the search snippet is used and the source says so.
- **Report**: Summary, Findings, Conflicts, Unverified and Gaps, with `[n]`
  citations that link to the numbered sources. The Sources list and the
  evidence check are written by the server from what was actually retrieved:
  citations to numbers that do not exist are removed, uncited statements are
  counted, and a report from a model that cited nothing says nothing is
  verified. Repetition loops and the length limit are detected and reported.
- **Progress** streams live (planning, each search, each page) and is saved
  with the reply. Reports can be exported as Markdown, regenerated as
  research, and followed up in normal chat. Conversation files are used as
  `[F]` sources. If no source responds, the reply explains why instead of
  inventing an answer.
- **Model choice matters**: `qwen2.5:1.5b` often fails to cite; `llama3.2:3b`
  or larger produces properly cited reports.

### Tests

`npm run e2e:attachments` and `npm run e2e:research` cover the above in
headless Chrome, including a fake SearXNG that returns a private address
(it must not be fetched) and the no-source failure path.

### Model selection

- **Two controls.** The model picker in the composer offers Auto plus the
  models the user's plan allows, each with capability labels and its
  limitations on hover. The optimisation selector at the top right of the chat
  (Intelligence, Balance, Cost; Balance by default, stored in `harbor-mode`)
  decides how Auto routes; with a manually chosen model it is kept for when
  Auto is turned back on.
- **Auto** is the default: Auto with Balance. Each turn is classified from the
  latest message, its files and the length of the chat (`lib/models/router.ts`):
  coding, reasoning or general, with a 0–1 complexity score. Models are scored
  from their parameter count, what they were trained for (coder, reasoning,
  vision from Ollama `/api/show`) and their memory cost (lighter when Ollama
  already holds them, from `/api/ps`).
  - **Intelligence** takes the strongest fit regardless of size, e.g.
    `qwen2.5-coder:14b` for code.
  - **Balance** trades quality against memory, more so for quick questions,
    e.g. `llama3.2:3b` for a short question.
  - **Cost** takes the lightest model that fits, e.g. `gemma3:1b` for chat
    or `qwen2.5-coder:1.5b` for code.
  - Images always go to a model that can read them (`gemma3:4b`).
- **Manual**: any installed model the plan allows can be picked from the same
  menu, which has search, groups (General, Reasoning, Coding, Cloud) and
  capability badges. Only installed models, or cloud models that passed their
  last check, are listed. Downloading, removing and configuring models is in
  the admin panel (`/admin/models`, `/admin/agents`); `/api/models` refuses
  those changes from non-admins, and `/chat/models` redirects.
- **Switching** keeps the conversation: history is stored on the server and
  sent to whichever model answers next. A chat remembers its Auto mode
  (`conversations.model_mode`), each reply says which model answered and why,
  and every automatic choice is recorded in `model_selections` (migration 10).
- **Cmd/Ctrl+K** (or "Search chats" in the sidebar) opens a compact search
  panel over titles and messages with recent chats when empty. It has no
  backdrop, the sidebar and header stay as they are, and Escape returns to the
  page. Shortcut labels are chosen in the browser from the visitor's OS
  (`lib/shortcuts.ts`): ⌘ and ⇧ on macOS, Ctrl and Shift elsewhere.

### Layout

Every signed-in page, including admin, Help, Plans, Usage and the IDE
workspace list, renders inside the same shell: the fixed sidebar and a header
bar, with one scrolling content column. On `/admin` the sidebar's chat list is
replaced by the admin sections.

`npm run e2e:models` checks the menu and sends real turns in each mode.

### IDE for every plan that includes it

- **Access** follows the plan's `features.ide` (admins always). The pages
  (`requireIdePage`) send other plans to `/plans`; the API (`ideUser` in
  `lib/ide/guard.ts`) answers 403 with the plan block. Mutations still need a
  same-site Origin.
- **Ownership**: a workspace belongs to `workspaces.created_by`. Customers
  list and open only their own; anything else is a 404. Admins see theirs plus
  ones whose owner was deleted, and can open any for support. Deleting an
  account erases that user's workspaces.
- **Storage**: every save, new file and clone is checked against the plan's
  `storageMb.ide` across all of the user's workspaces (413 with what is used).
  Capped plans clone with `--depth 1`, and a clone that ends up too big is
  removed. Customers' deletes are permanent so the trash cannot hold
  uncounted data; admins keep the recoverable trash.
- **Terminal** stays admin-only: it is a real shell on the server. Customers
  see why in the panel, and the API refuses with 403.
- **Assistant** (Sparkles in the activity bar): questions about the open file
  and selection, answered by the plan's models with Auto and the optimisation
  modes, streamed from `/api/ide/workspaces/:id/assist`. It is metered as the
  `ide` feature against the plan's allowance. Secrets files (`.env`, keys) are
  never sent. It cannot run code or edit files and says so.

`npm run e2e:ide` covers all of the above with a customer and an admin.

### Accounts, IDs and admin roles

- Every account has a **user ID** `XAIU<year><8 characters>` (e.g.
  `XAIU2026RBRGZUR5`; no 0/O/1/I) and a generated **username** such as
  `user8s7uxp4d`. Both are unique in the database, regenerated on collision,
  shown in Settings → Account and Admin → Users, and never editable. Existing
  accounts were backfilled with the year they registered (migration 11).
- Sign-in accepts the email or the exact username. The old rule that matched
  the part of an email before "@" is gone, since it let similar addresses
  collide.
- **Roles**: User, Administrator, Super Administrator. Only a Super
  Administrator can change roles or reset, suspend or change the plan of
  another admin; this is checked in the server actions, not only hidden in the
  menu. The last active Super Administrator cannot be demoted, suspended or
  deleted.
- **Registration never creates admins.** The rule that made the first
  registered account an admin, and the `ADMIN_EMAILS` promotion list, are
  removed.
- **Bootstrap**: on first start, `ADMIN_EMAIL`, `ADMIN_USERNAME` (default
  `admin`) and `ADMIN_PASSWORD_HASH` create the Super Administrator with a
  forced password change. To promote or recover an existing account, run
  `npm run admin:bootstrap -- --email you@example.com` on the server. It reads
  the password from stdin, stores only a bcrypt hash, forces a change at the
  next sign-in, ends existing sessions and writes an audit entry.

`npm run e2e:auth` covers registration, IDs, username sign-in, the bootstrap
and forced change, and replays admin actions as a plain Administrator to prove
the server refuses them.

### Admin overview and user management

- **Overview** (`/admin`) is measured, not estimated: accounts, plans,
  requests, tokens, errors and content come from the database for 7, 30 or 90
  days; CPU, memory, uptime, database health, storage and disk come from this
  server; Ollama status and loaded models from the runtime. It refreshes every
  15 seconds while the tab is visible (pause or refresh by hand), served by
  `GET /api/admin/metrics` (admins only). Revenue says "not available" because
  no payment gateway is connected.
- **Security events**: failed, suspended and rate-limited sign-ins are recorded
  in `security_events` (migration 14), shown on the overview with when
  recording began. Earlier attempts were never stored and are not invented.
- **Users** (`/admin/users`): filters by status and plan; each row's menu has
  View details, Edit profile (name and email; usernames and IDs stay
  generated), Plan and limits, Usage, Activity, role changes, Reset password,
  Suspend/Reactivate, Remove data… and Delete account…. Select rows for bulk
  Suspend, Reactivate, Remove data or Delete (up to 100 at once).
- **User details** (`/admin/users/:id`): profile, plan windows, usage by model
  and feature, recent requests, admin actions on or by the account and its
  sign-in problems.
- **Delete and remove data** first show exactly what will go (conversations,
  messages, files, IDE workspaces, memories) and require typing `DELETE` or
  `CLEAN UP`. Usage records and the audit log are always kept. The server
  refuses your own account, other admins unless you are a Super
  Administrator, and the last admin or Super Administrator; refused rows are
  listed and skipped. Every action is audited (`user.delete`, `user.cleanup`,
  `user.update`).
- Agents without an adapter in this build (Claude, Codex, Gemini via ACP) are
  shown as unavailable instead of with an on/off switch.

`npm run e2e:admin` covers the metrics API and its admin-only access, the
recorded failed sign-in, the dashboard, profile edits, removing data while
keeping usage records, the typed confirmation and a bulk delete.

### Plans: Free, Basic, Advance

- Every account is on **Free**, **Basic** or **Advance** (migration 12
  normalised older values to Free). Admin → Plans sets, per plan: the models
  it includes (or "every model, including future ones"), daily, weekly and
  monthly token allowances, per-model and per-feature limits (chat, Deep
  Research, IDE assistant), whether attachments, Deep Research, the IDE and
  cloud models are included, storage, and whether the monthly allowance resets
  on the 1st or on the day the plan started. **A limit of 0 means unlimited**
  everywhere. Prices stay unset until an admin enters them; none are invented.
- Admin → Users → *Change plan and limits* moves an account between plans and
  sets personal daily/weekly/monthly limits that replace the plan's (empty =
  use the plan's, 0 = unlimited). Plan edits and account changes are audited
  (`plans.update`, `user.plan`).
- **Enforced on the server.** `/api/models`, warm-up, conversation creation,
  `/api/chat` and uploads only accept models and features in the account's
  plan; others are left out of every list and response, not just hidden.
  Installed models are never removed. A refusal returns
  `{ error, plan: { code, requiredPlan, resetAt } }`: 403 `upgrade_required`
  names the cheapest plan that unlocks it, 429 `limit_reached` gives the reset
  time. Administrators are not limited.
- **Usage is summed from `usage_events`**, which store the input and output
  tokens the model reported, the feature, and whether the count had to be
  estimated (Ollama occasionally omits counts; estimates are flagged and their
  total is shown on the Usage page). Days start at 00:00 UTC, weeks on Monday.
  A request that starts within the allowance has its output capped to what is
  left, so it cannot run far past it.
- **Pages**: `/plans` compares the plans (other plans show model counts and
  capabilities, not the names of models outside your plan) and `/usage` shows
  each window, its reset time, and usage by model and feature. The chat shows
  an upgrade prompt in place of a refused reply, a warning above the composer
  at 80% of any limit, and Deep Research as locked with the plan that unlocks
  it. There is no online checkout yet, so upgrading is done by an admin.

`npm run e2e:plans` checks every tier against real models (lists, picker,
refusals and the plan they name, limits including 0 = unlimited, the prompts,
both pages and their totals against the database). Other suites seed their
account on Advance with `SEED_USER_PLAN=advance`.

### Model descriptions

Every model in the picker and on the models page carries capabilities,
context window and limitations built from what the provider reports, not
from a hand-written list:

- Capabilities come from Ollama's `/api/show` (`vision`, `thinking`, `tools`)
  plus what the app adds (documents as text). Coding and multilingual labels
  are inferred from the model family and say so in their tooltip.
- The context window is the one the model actually runs with: the
  `context_length` of the loaded model from `/api/ps`, else the Modelfile
  `num_ctx` or the server default, always capped at the model's own maximum
  (`model_info.*.context_length`). The maximum is shown separately when it
  is larger. Cloud models whose window is not reported say so.
- Limitations cover missing image input, small models, slow thinking models,
  short windows, external providers and what the model can do with links.

### Context window and summaries

`lib/context` assembles each turn by category: system prompt, the user's
instructions and preferences, memories and recent chat titles, the summary of
older messages, earlier messages, attachments, web pages and the current
message. Each piece of text is counted once (about 4 characters per token, 600
per image). Tools, skills, MCP servers and sub-agents are not used by this app
and are listed as such rather than shown as zero-sized bars.

- A share of the window is kept free for the reply (a quarter, at most 4,096).
- Earlier messages fill up to 70% of what is left, newest first. Older ones are
  summarised by the conversation's model (at most 600 tokens) before the reply,
  the summary is stored on the conversation with the message it covers up to,
  and it is reused until the thread changes. Summary calls are recorded as
  usage with feature `summary`, so they count toward plan limits.
- `GET /api/context` returns what the next turn would send, without
  summarising; the composer's meter uses it and adds the unsent draft. Each
  reply stores its snapshot and, when the provider reports it, the exact
  prompt and reply tokens, which are shown separately from the estimates.

The plan allowance (tokens per day, week or month) is separate from the
context window (tokens per request); neither is shown as the other.

### Web pages in chat

When a message contains links (up to three), the server opens them with the
same fetcher as Deep Research: http(s) only, no credentials in links, private,
loopback and link-local addresses refused at connect time, redirects
re-checked, 2 MB and 12 s per page, 40 pages per user per 10 minutes. Page
text goes into the prompt as untrusted content with its URL, and the reply
lists each page read or the reason it failed. The model is told it can read
pasted links but cannot search the web from chat.

Admin → Research → "Read links in chat" turns this off. Then nothing is
fetched, the model is told it cannot open websites, and a reply to a message
with a link carries the fixed message: "I'm a large language model and cannot
directly visit websites in this configuration. However, I can help review
website content if you provide the URL, page content, or relevant documents."

`npm run e2e:context` covers the meter, the exact counts, summarising a long
conversation built from these docs, and link reading on and off.

### Assistant names

Customers never see model IDs. Each model gets a generated name,
`xAI <family> <tier>`: the family word follows the model family (Atlas for
Llama, Nova for Gemma, Orion for Qwen, Forge for code models, Sage for
reasoning models, Helix, Aria and Zenith for the GPT, Claude and Gemini
families, Echo otherwise), and the tier follows parameter count (Mini under
2B, Core under 8B, Pro under 30B, Ultra above; external models have none).
Duplicates get " 2", " 3" in model-key order, so names do not shift when the
list changes. The one-line description comes from the tier and the strongest
reported capability.

Admin → Models → "Customer-facing names" overrides the name (2 to 40
characters, unique across assistants) and description per model; leaving a
field empty returns to the generated one. Overrides live in `model_branding`
(migration 16), keyed by provider and model ID, and every change is audited
as `model.branding`. Admins still see the model ID beside the name in the
picker and on the Usage page. Replies from models that were removed later
are labelled with the generated name.

### Conversation management

Admin → Conversations lists titles, owners and counts only. Selecting rows
offers export and delete. Export needs a written reason of at least 10
characters and is audited per conversation. Delete shows what goes (chats,
messages, attached files), needs DELETE typed, keeps token usage records, and
audits each chat. Retention (days, 0 = off) deletes unpinned chats not
updated in that many days, once on save after a warning with the count, then
hourly. `npm run e2e:conversations` covers export, bulk delete, retention and
assistant names.

### Search and DeepThink

Chat Search (Globe next to the model picker) is separate from Deep Research.
It reads `SEARCH_PROVIDER` (`searxng` or `tavily`) plus `SEARXNG_URL` or
`TAVILY_API_KEY` from the environment. When unset, the toggle explains that
no provider is configured; there is no silent fallback. Admin → Research
"Read links in chat" still gates fetching. Sources are streamed as
`data-sources` before the answer, then marked cited from `[n]` markers.

DeepThink (Brain) asks reasoning-capable models to think in `<think>` blocks.
The stream extracts reasoning via AI SDK middleware, shows "Thought for Xs",
and stores `thinking` / `thinkingMs` in message meta. Both toggles persist per
conversation (migration 17: `search_enabled`, `deep_think`).

## 7. Needs a provider before it can work

| Capability | What is missing |
| --- | --- |
| Broader web research | SearXNG, Tavily or Brave Search under Admin → Research (Wikipedia works without setup) |
| Email verification and password reset | SMTP keys under Admin → Integrations (sending not wired yet) |
| Google / phone sign-in | Firebase config under Admin → Integrations (auth flow not wired yet) |
| Paid checkout | Razorpay / Stripe keys under Admin → Integrations (checkout not wired yet) |
| Image, GIF and video generation, voice | Provider integrations (not built yet; not shown in the UI) |

## 8. Next up

1. Optical text recognition for scanned PDFs and images for non-vision models.
2. Phase 3 remainder: SMTP settings in admin, email verification, password
   reset, optional Google sign-in and 2FA.
3. Phase 8: projects in chat, custom assistants, share links.
4. A library page listing a user's files across chats.

Capabilities without a working backend are not shown in the UI until they are
implemented.
