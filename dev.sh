#!/bin/bash
# Auto-restarting dev server wrapper
# Restarts Next.js automatically when it crashes

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24 > /dev/null 2>&1

cd "$(dirname "$0")"

while true; do
  # Kill zombies and free ports before starting
  pkill -9 -f 'workerd serve' 2>/dev/null
  lsof -ti:3000 -ti:3333 | xargs kill -9 2>/dev/null
  rm -f .next/dev/lock
  sleep 1

  echo ""
  echo "========================================"
  echo "  Starting dev server on port 3333..."
  echo "========================================"
  echo ""
  NODE_OPTIONS='--max-old-space-size=4096' npx next dev --port 3333 --webpack
  EXIT_CODE=$?
  echo ""
  echo "!! Server exited with code $EXIT_CODE — restarting in 3 seconds..."
  echo ""
  sleep 3
done
