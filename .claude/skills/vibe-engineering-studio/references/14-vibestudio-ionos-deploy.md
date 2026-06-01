---
name: vibestudio-ionos-deploy
description: "Use when deploying VibeStudio to the IONOS VM (212.227.54.250) or managing the dev SSH tunnel. Covers: creating Postgres user/db on IONOS, running the SSH tunnel on local 5545, systemd units for api/web, nginx reverse proxy, deploy.sh, env.production. The VM is shared with ACCA — careful with port + user namespacing."
---

# VibeStudio — IONOS Deployment

## Infra at a glance

- **VM:** `212.227.54.250` (IONOS Cloud, EU-DE)
- **Postgres:** running on the VM, port 5432, shared with ACCA's `accadb`
- **VibeStudio DB:** `vibestudio` (separate database)
- **Web app:** Next.js, served by `vibestudio-web.service` on port 3100
- **API:** Express, served by `vibestudio-api.service` on port 4100
- **Nginx:** reverse proxy in front of both, TLS via certbot
- **Domain:** suggest `vibestudio.codes-ai.uk` (or your choice)

## Local dev tunnel (Step 5 of ACTION_PLAN.md)

```bash
node scripts/ensure-db-tunnel.js     # opens 127.0.0.1:5545 → IONOS
node scripts/tunnel-status.js        # health check
node scripts/tunnel-watchdog.js &    # self-healing background
```

The tunnel uses your SSH key (`TUNNEL_SSH_KEY` env). The remote
firewall blocks direct Postgres connections from dev IPs, so the
tunnel is mandatory.

**Port 5545** — NOT 5544 (that's ACCA's). The two coexist.

## Create the database (one-time, on the VM)

```bash
ssh root@212.227.54.250
sudo -u postgres psql

CREATE USER vibestudio WITH PASSWORD '<choose_strong>';
CREATE DATABASE vibestudio OWNER vibestudio;
GRANT ALL PRIVILEGES ON DATABASE vibestudio TO vibestudio;

-- Required for the JSONB queries used by dev_prompt_history etc.
\c vibestudio
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\q
```

## Production deployment

```bash
# On the VM (first time only)
git clone git@github.com:<org>/vibestudio.git /srv/vibestudio
cd /srv/vibestudio
cp deploy/env.production.example .env.production
# Edit .env.production — fill in DB password, JWT secrets, AI keys
# (PORT, WEB_PORT can stay defaults)

# Install + build
npm install --omit=dev
npm run db:migrate
npm run db:seed
npm run build

# Install systemd units
sudo cp deploy/systemd/vibestudio-api.service  /etc/systemd/system/
sudo cp deploy/systemd/vibestudio-web.service  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vibestudio-api vibestudio-web
sudo systemctl start  vibestudio-api vibestudio-web

# Verify
sudo systemctl status vibestudio-api
sudo systemctl status vibestudio-web
curl -s http://localhost:4100/health
curl -s http://localhost:3100 -I | head -1

# Nginx
sudo cp deploy/nginx/vibestudio.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/vibestudio.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS
sudo certbot --nginx -d vibestudio.codes-ai.uk
```

## Continuous deployment

`deploy/deploy.sh` is meant to run on the VM:

```bash
cd /srv/vibestudio
git fetch origin && git reset --hard origin/main
npm install --omit=dev
npm run db:migrate
npm run build
sudo systemctl restart vibestudio-api vibestudio-web
```

Trigger from GitHub Actions on push to `main` (see `.github/workflows/ci.yml`).

## Rollback

```bash
cd /srv/vibestudio
git log --oneline -5
git reset --hard <previous_sha>
npm install --omit=dev
npm run build
sudo systemctl restart vibestudio-api vibestudio-web
# Migrations: prefer NEW rollback migration; never edit existing
```

## Coexisting with ACCA on the same VM

| Service | ACCA | VibeStudio |
|---|---|---|
| Web port | 3000 | 3100 |
| API port | 4000 | 4100 |
| DB tunnel (local→VM) | 5544 | 5545 |
| DB name | accadb | vibestudio |
| DB user | acca | vibestudio |
| systemd units | acca-api/web | vibestudio-api/web |
| nginx server_name | acca.codes-ai.uk | vibestudio.codes-ai.uk |
| /srv path | /srv/acca | /srv/vibestudio |

Both share the same Postgres instance + same SSH key + same VM
resources. Watch memory: combined Node footprint ≈ 600MB.

## Related skills

- [[vibestudio-session-bootstrap]]
- [[vibestudio-database]]
- [[acca-db-tunnel-recovery]] (if present in user-global) — same pattern
