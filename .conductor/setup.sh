#!/usr/bin/env bash
# Runs when Conductor creates a workspace. Git-tracked files are checked out for
# you; everything ignored (.env.local, node_modules) has to come from here.
set -euo pipefail

ROOT="${CONDUCTOR_ROOT_PATH:-$HOME/conductor/repos/summit-air-demo}"

if [ -f "$ROOT/.env.local" ]; then
  cp "$ROOT/.env.local" .env.local
  echo "setup: copied .env.local"
else
  echo "setup: no .env.local at $ROOT — create it in the main checkout" >&2
fi

npm ci
echo "setup: ready"
