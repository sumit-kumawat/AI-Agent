# Deploy xAI on Dell PowerEdge R610

Target: a typical PowerEdge R610 (Xeon 5500/5600 class, 24–72 GB RAM, no modern GPU). The stack is CPU-only and uses Docker Compose with bind-mounted data under `./data`.

## Hardware guidance

| Component | Recommendation |
| --- | --- |
| CPU | Dual Xeon is fine; prefer fewer, larger Ollama models over many concurrent large ones |
| RAM | 32 GB minimum; 48–64 GB preferred if you run 7B–14B models |
| Disk | SSD strongly preferred for SQLite + model layers; keep ≥100 GB free |
| GPU | Not required; omit NVIDIA runtime |
| OS | Ubuntu 22.04/24.04 LTS x86_64 |

Use modest models on this hardware (`llama3.2:3b`, `qwen2.5:1.5b`, `gemma3:4b`). A 14B model needs roughly 10–16 GB RAM free for Ollama alone.

## One-time host setup

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git ca-certificates
sudo usermod -aG docker "$USER"   # re-login after this
mkdir -p /opt/xai && cd /opt/xai
git clone https://github.com/sumit-kumawat/AI-Agent.git .
cp .env.example .env
```

Edit `.env`:

```bash
AUTH_SECRET=$(openssl rand -base64 32)
# AUTH_URL=https://chat.example.com   # set when behind TLS
OLLAMA_MODEL=llama3.2:3b
APP_PORT=3000
# ADMIN_EMAIL=you@example.com
# ADMIN_PASSWORD_HASH=...             # from: npm run hash-password
```

Create data directories (owned by you; Docker maps them into the containers):

```bash
mkdir -p data/ollama data/uploads data/workspaces data/creative data/backups
```

## Start / stop / update

```bash
docker compose up -d --build
docker compose exec ollama ollama pull llama3.2:3b
docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
```

Update to a new release:

```bash
cd /opt/xai
git pull
docker compose up -d --build
```

Stop:

```bash
docker compose down   # keeps ./data
```

## Backup and restore

SQLite lives at `./data/harbor.db`. Prefer a consistent copy while the app is briefly stopped, or use a filesystem snapshot.

```bash
# Backup
docker compose stop app
tar -C /opt/xai -czf "/opt/xai/data/backups/xai-$(date +%Y%m%d%H%M).tgz" data/harbor.db data/uploads data/workspaces data/creative
docker compose start app

# Restore (destructive)
docker compose down
tar -C /opt/xai -xzf /path/to/backup.tgz
docker compose up -d
```

Do not commit `data/` or `.env` to git.

## Networking and TLS

- Open firewall port `APP_PORT` (default 3000) only on trusted networks, or put Nginx/Caddy in front with HTTPS and set `AUTH_URL` to the public URL.
- Keep Ollama on the Docker network (`http://ollama:11434`); do not publish `11434` publicly.

## Optional creative worker

On the host (same `./data` directory):

```bash
DATA_DIR=/opt/xai/data node /opt/xai/scripts/creative-worker.mjs
```

Heavy image/video generation still requires engines installed later.

## Health and logs

```bash
docker compose logs -f app --tail=200
docker compose logs -f ollama --tail=100
curl -fsS http://127.0.0.1:3000/api/health
```

Containers use `restart: unless-stopped` and JSON log rotation (20 MB × 5).

## Resource notes for R610

Compose caps the app at ~2 GB RAM and Ollama at ~12 GB. Raise Ollama’s limit only if the host has spare RAM after OS overhead. If the machine swaps heavily, drop to smaller models or reduce concurrent chat load.
