#!/usr/bin/env bash
# Starts the backend for end-to-end tests on a fresh SQLite database.
set -euo pipefail
cd "$(dirname "$0")/../../backend"

PY="${PYTHON:-}"
if [[ -z "$PY" ]]; then
  if [[ -x venv/bin/python ]]; then PY=venv/bin/python
  elif [[ -x venv/Scripts/python.exe ]]; then PY=venv/Scripts/python.exe
  else PY=python3; fi
fi

TMP="$(mktemp -d)"
export DATABASE_URL="sqlite:///$TMP/e2e.db"
export MODEL_DIR="$TMP/models"
export SUPABASE_JWT_SECRET="$E2E_JWT_SECRET"
exec "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "${API_PORT:-8100}"
