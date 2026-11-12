#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "${ROOT_DIR}/.env" ]; then
  if [ -z "${REMOTE_HOST:-}" ]; then
    REMOTE_HOST="$(grep -E '^REMOTE_HOST=' "${ROOT_DIR}/.env" | tail -n1 | cut -d'=' -f2- || true)"
  fi
  if [ -z "${REMOTE_DIR:-}" ]; then
    REMOTE_DIR="$(grep -E '^REMOTE_DIR=' "${ROOT_DIR}/.env" | tail -n1 | cut -d'=' -f2- || true)"
  fi
fi

REMOTE_HOST="${REMOTE_HOST:-finance-server}"
REMOTE_DIR="${REMOTE_DIR:-/opt/personal-finance-dashboard}"

echo "==> Preparing ${REMOTE_DIR} on ${REMOTE_HOST}..."
ssh -o BatchMode=yes "${REMOTE_HOST}" "sudo mkdir -p ${REMOTE_DIR} && sudo chown -R \$(whoami):\$(whoami) ${REMOTE_DIR}"

echo "==> Syncing repository to ${REMOTE_HOST}:${REMOTE_DIR}..."
rsync -az --delete \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'backend/.venv' \
  --exclude 'backend/__pycache__' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  "${ROOT_DIR}/" "${REMOTE_HOST}:${REMOTE_DIR}/"

echo "==> Ensuring .env exists on ${REMOTE_HOST} (preserving existing secrets if already present)..."
ssh -o BatchMode=yes "${REMOTE_HOST}" "
  if [ ! -f ${REMOTE_DIR}/.env ]; then
    cp ${REMOTE_DIR}/.env.example ${REMOTE_DIR}/.env
    chmod 600 ${REMOTE_DIR}/.env
    echo 'Created initial .env from .env.example (update DATABASE_URL if needed)'
  fi
"

echo "==> Building and starting Docker container on ${REMOTE_HOST}..."
ssh -o BatchMode=yes "${REMOTE_HOST}" "cd ${REMOTE_DIR} && docker compose up -d --build"

echo "==> Waiting for healthcheck on ${REMOTE_HOST}..."
ssh -o BatchMode=yes "${REMOTE_HOST}" '
  for i in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
      curl -fsS http://127.0.0.1:8000/api/health
      echo ""
      exit 0
    fi
    sleep 1
  done
  docker logs finance-dashboard --tail=50 || true
  exit 1
'

echo "==> Deployment complete!"
