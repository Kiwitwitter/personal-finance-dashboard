#!/usr/bin/env bash
set -euo pipefail

echo "[finance-dashboard] Running Alembic migrations on app.* schema..."
alembic upgrade head

echo "[finance-dashboard] Starting FastAPI + SPA + Streamable HTTP MCP on ${HOST:-0.0.0.0}:${PORT:-8000}..."
exec uvicorn app.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
