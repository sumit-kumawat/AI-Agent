# xAI

The xAI application: AI chat, Deep Research, attachments and an in-browser IDE, with plans, usage metering and an admin panel. Built with Next.js App Router, Auth.js, SQLite and the AI SDK; assistants run on Ollama models and, optionally, connected cloud providers.

This document is for operators. Customers see xAI-branded assistant names; the underlying models, Ollama and the hosting setup are visible only to administrators. See `docs/PLATFORM.md` for what each release changed.

Some internal names keep the project's original "harbor" name for compatibility: the database file `data/harbor.db`, the Docker volume `harbor-data`, the container user, and browser storage keys such as `harbor-model`. Renaming them would orphan existing data or reset users' saved choices.

## 1. Install Ollama and a model

Ollama is separate from this app. The default model is `qwen2.5-coder:14b` (Apache-2.0, about 9 GB). A smaller tag works if you change `OLLAMA_MODEL`.

On macOS:

```bash
brew install ollama
brew services start ollama      # runs now and at login
ollama pull qwen2.5-coder:14b
```

On Linux, use the installer from [ollama.com](https://ollama.com), which sets up a systemd service.

Small models reply fastest. A good starter set:

```bash
ollama pull llama3.2:1b    # 1.3 GB, near-instant replies
ollama pull llama3.2:3b    # 2.0 GB, better quality, still quick
```

You can also download models from the app. Open **Models** in the chat sidebar while signed in as an admin. The library lists Llama, Qwen, Gemma, DeepSeek R1, Mistral, Phi, and Granite builds from 1B to 70B, and accepts any other Ollama model name. Models smaller than about one billion parameters, and embedding models, are hidden from the chat picker.

## 2. Configure environment

```bash
cp .env.example .env.local
openssl rand -base64 32         # paste into AUTH_SECRET
```

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AUTH_SECRET` | yes | none | 32+ characters. Production refuses to boot with the placeholder. |
| `AUTH_URL` | behind a proxy | none | Public URL, for example `https://chat.example.com`. Leave unset for local and LAN use. |
| `OLLAMA_BASE_URL` | no | `http://127.0.0.1:11434` | Ollama host, without `/v1` |
| `OLLAMA_MODEL` | no | `qwen2.5-coder:14b` | Default for new chats when it is installed |
| `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | first run | none, `admin`, none | Creates the Super Administrator on first start, with a forced password change. Registration never creates admins. `npm run admin:bootstrap` promotes or recovers an existing account from the server's shell. |
| `DATA_DIR` | no | `./data` | Where `harbor.db` lives |

## Use it from a phone or another computer

The server listens on every network interface. Find this machine's address with `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux), then open `http://<that-address>:3000` on any device on the same Wi-Fi. Leave `AUTH_URL` unset so sign-in works on whichever address each device uses.

## 3. Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create an account, then send a message. The first account on a fresh server becomes the admin.

The database lives in `data/harbor.db`. Migrations in `lib/db/migrate.ts` run automatically on startup, each one once, tracked by SQLite's `user_version`. Add a schema change by appending a function to `MIGRATIONS` and updating `lib/db/schema.ts` to match.

To create a starter admin and a test user:

```bash
npm run seed
```

It creates `admin@harbor.local` (admin) and `test@harbor.local` (user) if they do not exist, and prints a random password for each. Set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_EMAIL`, and `SEED_USER_PASSWORD` to choose them. Existing accounts are never changed.

## Chat

- The sidebar lists conversations newest first, grouped by day, with **New chat** at the top. Each one can be renamed or deleted from its menu. On desktop the sidebar collapses; on phones it opens from the menu button.
- Replies stream token by token with a blinking caret and render as markdown, with syntax-highlighted code blocks (with a copy button), tables, and lists. Rendering uses [Streamdown](https://streamdown.ai).
- Enter sends and Shift+Enter adds a line. The composer grows with the text, and the model selector sits at its left.
- Hover a message to copy it. Use **Regenerate** under the last reply, and **Stop** while a reply is streaming; a stopped reply keeps what was written so far.
- The view follows a streaming reply until you scroll up, then a button jumps back to the latest message.
- Each chat is named from its first message. Click the title in the top bar to rename it.
- The bar beside the send button shows how full the model's context window is. Hover or click it for the breakdown by kind of content (system prompt, your instructions, memories, summary, earlier messages, files, web pages, your draft), the space kept for the reply, and what is left. Category counts are estimates; after a reply it also shows the model's own exact count. When a long chat no longer fits, older messages are summarised by the chat's model and the summary is reused on later turns.
- Paste a link into a message and the server reads the page (public addresses only) and lists the pages it read above the reply. An admin can turn this off under Admin → Research; the reply then says the assistant cannot visit websites.
- Each installed model on the models page lists what it can do, its real context window, and its limitations, from what Ollama reports.
- The sun and moon button in the sidebar footer switches between light and dark mode.

## Admin panel

Admins see an **Admin panel** link in the chat sidebar, or open `/admin` directly. Everyone else is sent back to `/chat`. The proxy checks the role on every request and the admin layout and actions check it again in the database, so promotions, demotions, and suspensions take effect immediately.

| Route | What it does |
| --- | --- |
| `/admin` | Totals for users, tokens, active sessions, and recent admin actions |
| `/admin/users` | Search and page through users (20 per page) with role, last active, plan, usage this month, and total tokens. Change role, reset a password (shows a one-time temporary password and signs the user out), suspend or reactivate, and change the plan or set personal token limits (0 = unlimited). |
| `/admin/plans` | Free, Basic and Advance: included models, daily/weekly/monthly allowances, per-model and per-feature limits, features, storage and reset period. A limit of 0 means unlimited. See `docs/PLATFORM.md`. |
| `/admin/usage` | Tokens per user and per model by day, week, or month, plus a log of rate-limit hits |
| `/admin/agents` | Turn agents on or off, set each agent's concurrency limit, watch running sessions and stop them, and enable or disable individual Ollama models |
| `/admin/settings` | Chat rate limit per user per minute, open or closed registration, a moderation keyword blocklist, and the audit log |
| `/admin/conversations` | Find conversations by user email or keyword, read the full history, and flag or delete messages |

Every admin change is written to the audit log with who made it and when. The Claude, Codex, and Gemini entries on the agents page are placeholders for ACP adapters; they show "no adapter connected" until one is wired in `lib/agents.ts`.

## 4. Production on one machine

```bash
npm ci
npm run build                   # writes a standalone server to .next/standalone
npm start                       # loads .env*, serves on 0.0.0.0:3000
```

`npm start` keeps the database in the project's `data/` folder, so rebuilding does not touch user data. Set `PORT` or `HOSTNAME` to change the listener.

Put a TLS reverse proxy (Caddy, nginx, or a cloud load balancer) in front, and set `AUTH_URL` to the public HTTPS URL. Run the server under a process manager such as systemd, launchd, or pm2 so it restarts on failure.

Back up `data/harbor.db` with `sqlite3 data/harbor.db ".backup backup.db"`, which is safe while the app runs.

## 5. Production with Docker

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env
docker compose up -d --build
docker compose exec ollama ollama pull qwen2.5-coder:14b
```

The app stores its database in the `harbor-data` volume and models live in `ollama-models`. On macOS, Docker cannot use the GPU, so a native Ollama install is much faster. In that case, remove the `ollama` service and set `OLLAMA_BASE_URL=http://host.docker.internal:11434`.

## Operations

- `GET /api/health` returns `200` with `{ ok, database, ollama, model, models }` when the database is up and at least one chat model is installed, and `503` otherwise. Point uptime checks and load balancers at it.
- `npm run smoke` runs an end-to-end check against a running server: health, register, sign in, list models, a streamed reply, a reply after switching models, saved history, and cleanup. Set `SMOKE_URL` to test another host and `SMOKE_MODEL` to pick the first model. It deletes its test account at the end, so it never becomes the first-account admin.
- `npm run e2e:admin` drives the admin panel in headless Chrome against a running server. It seeds a throwaway admin and user, exercises every admin page and action (models, agents, killing a session, plan and limits, blocklist, rate limit, flag and delete, suspend, password reset, role changes, audit log), restores the settings, and deletes both accounts. Set `CHROME_PATH` if Chrome is not in `/Applications`, and `E2E_URL` for another host. Screenshots go to `/tmp/harbor-e2e`.
- `npm run e2e:plans` checks Free, Basic and Advance end to end: which models each plan sees and can use, refusals that name the plan to upgrade to, token limits (0 = unlimited), the upgrade prompts, and the plans and usage pages against the recorded usage.
- `npm run e2e:context` checks the context meter and its breakdown, the exact token count after a reply, summarising a long conversation (stored, and its tokens recorded as usage), and link reading on and off, including a refused private address.
- `npm run e2e:chat` drives the chat UI in headless Chrome at desktop and phone sizes: streaming, markdown and code highlighting, copy, regenerate, stop, auto-scroll, rename, dark mode, and the sidebar. It uses `llama3.2:1b` by default; set `E2E_MODEL` to change it. It deletes its test account at the end.
- `DELETE /api/account` with `{ "password": "…" }` deletes the signed-in account and all of its conversations.
- Choosing a model in the picker preloads it for 30 minutes, so the first reply does not wait for a cold start.
- `npm run check` runs typecheck, lint, and the production build.

## Security

- Passwords are hashed with bcrypt (cost 12). Sign-in takes the same time whether or not the email exists.
- Rate limits: registration 10 per hour per IP, sign-in 30 per 15 minutes per IP and 10 per email, chat 30 per minute per user (adjustable in `/admin/settings`). Per-IP limits apply only behind a reverse proxy that sets `X-Forwarded-For`; without one, every visitor looks the same, so registration falls back to a server-wide cap of 200 per hour and sign-in relies on the per-email limit.
- Only admins can download or remove models.
- Responses carry a Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, and HSTS in production.
- Chat requests are capped at 2 MB, 200 messages, and 32,000 characters per message. Replies are capped at 4,096 tokens.

Rate limits are kept in memory. That is correct for one server process. If you run several instances, move them to Redis or similar.

## Project map

| Path | Role |
| --- | --- |
| `app/page.tsx` | Landing page |
| `app/login`, `app/register` | Auth screens |
| `app/chat` | Chat pages |
| `components/chat` | Sidebar, messages, composer, markdown, model picker |
| `app/api/chat/route.ts` | Streams a reply from Ollama and saves it |
| `app/api/register/route.ts` | Creates a user |
| `app/api/health/route.ts` | Health check |
| `app/api/models` | List, download, remove, and preload models |
| `app/admin/models` | Models page and library (admin) |
| `lib/model-catalog.ts` | The 1B to 70B model library |
| `app/api/auth/[...nextauth]/route.ts` | Auth.js handlers |
| `lib/auth.config.ts` | Session settings with no database access |
| `lib/auth.ts` | Credentials provider and the database-checked session |
| `lib/db/schema.ts` | Tables: users, conversations, messages, usage, audit log, agent and model config, settings |
| `lib/db/migrate.ts` | Ordered migrations, run on startup |
| `app/admin` | Admin panel pages and server actions |
| `lib/agents.ts` | Agent registry, concurrency limits, running sessions |
| `lib/settings.ts`, `lib/moderation.ts` | System settings and the keyword blocklist |
| `proxy.ts` | Sends anonymous visitors away from `/chat` and non-admins away from `/admin` |
| `scripts/` | Standalone build prep, production start, seed, smoke and admin tests |
