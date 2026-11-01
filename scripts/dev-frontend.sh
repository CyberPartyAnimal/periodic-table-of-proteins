#!/usr/bin/env bash
# Starts the Vite dev server (frontend, port 5173).
set -e
export PATH="$HOME/.local/node-v24.22.2-darwin-arm64/bin:$PATH"
cd "$(dirname "$0")/../frontend"
[ -d node_modules ] || npm install
exec npm run dev -- --host 127.0.0.1
