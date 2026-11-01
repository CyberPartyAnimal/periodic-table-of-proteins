#!/usr/bin/env bash
# Starts the FastAPI dev server (backend, port 8000). Requires Postgres to be running.
set -e
cd "$(dirname "$0")/../backend"
exec "$HOME/.local/bin/uv" run uvicorn app.main:app --reload --port 8000
