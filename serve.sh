#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT="${1:-3000}"
echo "Serving nykla-website at http://localhost:$PORT"
python3 -m http.server "$PORT"
