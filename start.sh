#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "Starting phone flip dashboard..."

cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
  "$PYTHON_BIN" -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!

cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

echo "Backend running on http://localhost:$BACKEND_PORT"
echo "Frontend running on http://localhost:$FRONTEND_PORT"
echo "Press Ctrl+C to stop."

trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true' INT TERM EXIT
wait
