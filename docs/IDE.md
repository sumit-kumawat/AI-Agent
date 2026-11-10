# xAI IDE: architecture and implementation plan

The IDE turns xAI into a Cursor-style development environment inside the
existing app. It reuses the existing stack and only adds what an editor and a
terminal genuinely need.

## Existing project (assessment)

| Area | What exists |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, standalone output, `proxy.ts`), React 19, TypeScript |
| UI | Tailwind 4, shadcn/radix components, lucide icons, global popup system (`components/feedback.tsx`) |
| Data | SQLite via better-sqlite3 and Drizzle; migrations by `PRAGMA user_version` in `lib/db/migrate.ts` |
| Auth | Auth.js v5 credentials, JWT re-validated against the database on every request; roles `admin`/`user`; forced first-login password change |
| AI | AI SDK v7 with an OpenAI-compatible provider pointed at Ollama; streaming chat, titles, usage and quota tracking, rate limits, moderation |
| Admin | Users, usage, agents and models, settings, conversation audit, audit log |
| Tests | `npm run smoke`, `npm run e2e:admin`, `npm run e2e:chat` (puppeteer with system Chrome) |

Limitations relevant to the IDE: no file or process access, a single AI
provider (Ollama), no editor, no WebSocket server (route handlers only), and a
strict CSP.

## Decisions

- **Who and where.** The IDE is admin-only. Each workspace is a folder under
  `WORKSPACES_ROOT` (default `data/workspaces`). Every file path is resolved and
  checked against the workspace folder, including through symlinks, so nothing
  outside it can be read or written. Container isolation for regular users is
  future work.
- **Theme.** The app stays light. The IDE has its own light/dark toggle.
- **Editor.** Monaco, served from the app itself (`public/monaco`) so the CSP
  stays `'self'`.
- **Terminal.** `node-pty` on the server and xterm.js in the browser. Output is
  streamed with Server-Sent Events and input is sent with POST, so no custom
  WebSocket server is needed.
- **AI.** A provider registry (Ollama today; OpenAI, Anthropic, Gemini and any
  OpenAI-compatible API through adapters). Keys are stored encrypted on the
  server and never sent to the browser.
- **Safety.** Commands that AI agents want to run need approval, destructive
  commands are always flagged, and file and terminal actions are audit logged.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Analysis and plan (this document) | Done |
| 2–3 | IDE workspace: workspaces, file explorer, Monaco tabs, save, create/rename/delete, global search, multiple terminals, resizable panels, IDE theme | Done (see below) |
| 4 | Provider registry and API keys, per-purpose models (chat, code, autocomplete, agent), IDE AI chat with file context | Planned |
| 5 | Codebase indexing with embeddings, semantic search, automatic context retrieval, incremental updates | Planned |
| 6 | Agent and Plan modes, Composer multi-file diffs with per-file accept/reject, command approval | Planned |
| 7 | Inline edit (select code, instruct, inline diff) and Tab autocomplete | Planned |
| 8 | Git panel (status, stage, commit, branches, diff, push/pull, AI commit messages and review), test and lint runs | Planned |
| 9 | Rules and memories, prompt templates, MCP client, custom commands | Planned |
| 10 | Hardening, performance and production testing | Planned |

Each phase is verified (typecheck, lint, build, smoke, e2e) before it is
committed.

## Phases 2–3: what exists now

Open it from **Admin panel → IDE** or the chat sidebar (admins only), at `/ide`.

- **Workspaces** (`/ide`): create an empty workspace or clone an `https://` Git
  repository; delete moves the folder to `WORKSPACES_ROOT/.trash/workspaces`.
- **Layout**: header (workspace, file search, command palette, theme, account
  menu), activity bar (Explorer, Search, panel toggle), resizable sidebar and
  bottom panel, status bar (problems, unsaved count, cursor, language, theme).
- **Explorer**: lazy folder tree; toolbar and right-click menu for new file or
  folder, rename or move, copy path, delete (to `.trash`, with confirmation).
  Dependency and build folders are dimmed; symlinks that leave the workspace are
  hidden and refused.
- **Editor**: Monaco with tabs (drag to reorder, middle-click to close, unsaved
  dot), syntax highlighting for every Monaco language, IntelliSense, find and
  replace, folding, minimap, sticky scroll, bracket guides, format document, go
  to line, go to definition and references (across open files), rename symbol.
  Saving checks the file's modification time and asks before overwriting a
  file that changed on disk. Leaving with unsaved edits warns first.
- **Search**: text or regex, case-sensitive, folder filter; results grouped by
  file and open at the matching line. Skips ignored folders, binaries, files
  over 1 MB, and secret files (`.env*`, keys).
- **Quick open and command palette**: `⌘P` fuzzy file finder; `⇧⌘P` (or `>`)
  runs every workbench command.
- **Bottom panel**: Problems (live Monaco diagnostics for open files), Output
  (IDE activity log), and Terminal (multiple real shells via node-pty; output
  streams over Server-Sent Events; sessions survive page reloads and close
  after 30 idle minutes).
- **Shortcuts**: `⌘S` save, `⌥⌘S` save all, `⌘P`, `⇧⌘P`, `⇧⌘F` search,
  `⇧⌘E` explorer, `⌘B` sidebar, ``⌃` `` panel, ``⌃⇧` `` new terminal (Ctrl
  instead of ⌘ on Windows and Linux; Ctrl chords go to the shell while a
  terminal has focus).
- **Theme**: light or dark for the IDE only; the rest of the app stays light.

### Security

- Every IDE API checks for an active admin (database-backed) and refuses
  writes whose `Origin` is not this site.
- Paths are normalised and resolved through `realpath`; `..`, absolute paths and
  symlinks that leave the workspace are refused. `.git` internals are read-only.
- Terminals start in the workspace with app secrets (`AUTH_*`, `ADMIN_*`, and
  any `*SECRET*`, `*TOKEN*`, `*PASSWORD*`, `*_KEY` variables) removed from the
  environment. A terminal is a real shell running as the server's OS user, which
  is why the IDE is admin-only; run the app as an unprivileged user (the Docker
  image does).
- Workspace create and delete, file create, rename and delete, and terminal
  open and close are recorded in the admin audit log.

### Known limits (planned in later phases)

- Go to definition across files works for files that are open; project-wide
  resolution arrives with indexing (phase 5).
- TypeScript semantic errors are off because workspace `node_modules` types are
  not loaded; syntax errors are reported.
- Replace across all files and a debug console are not built yet.
- `node-pty` ships no Linux prebuild; it compiles during `npm ci` (the Docker
  image has the build tools).

### Tests

`npm run e2e:ide` (with the server running) checks: admin-only access, path
traversal, cross-site requests, `.git` protection, symlink escape, creating,
editing, saving, conflict detection, Problems, search, quick open, the terminal
(real commands, working folder, hidden secrets), rename, delete, theme, and the
unsaved-changes warning.
