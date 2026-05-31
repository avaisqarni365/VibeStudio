#!/usr/bin/env bash
#
# deploy/deploy.sh — VibeStudio deploy script (runs ON the IONOS VM)
#
# Triggered manually or by GitHub Actions on push to main.
# Idempotent: safe to re-run.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/vibestudio}"
BRANCH="${BRANCH:-main}"
SUDO="${SUDO:-sudo}"

cd "$REPO_DIR"

echo "── 1. Pull latest main ──────────────────────────────────────"
git fetch origin
git reset --hard "origin/${BRANCH}"

echo "── 2. Install production deps ───────────────────────────────"
npm install --omit=dev

echo "── 3. Build ─────────────────────────────────────────────────"
npm run build

echo "── 4. Migrate DB ────────────────────────────────────────────"
# Safe — migrations are idempotent + non-destructive
npm run db:migrate

echo "── 5. Restart services ──────────────────────────────────────"
$SUDO systemctl restart vibestudio-api vibestudio-web

echo "── 6. Wait + verify ─────────────────────────────────────────"
sleep 3
curl -fs http://127.0.0.1:4100/health
echo ""
curl -sI http://127.0.0.1:3100 | head -1

echo "── Done ─────────────────────────────────────────────────────"
git log -1 --oneline
