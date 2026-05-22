#!/bin/bash
# Ensures Metro is running from the repo root.
# - If Metro is already running on port 8081, skips.
# - If not, starts `expo start` from the repo root in the background.
# NOTE: First-time setup still requires manually running `npx expo run:ios`
# from the repo root to do the Xcode build and install the app on the simulator.

REPO_ROOT="/Users/victorrecabarren/repos/mix"
METRO_PORT=8081
LOG_FILE="/tmp/expo-metro.log"

if lsof -i :$METRO_PORT -sTCP:LISTEN > /dev/null 2>&1; then
  echo "✓ Metro already running on port $METRO_PORT"
  exit 0
fi

echo "→ Metro not running, starting from $REPO_ROOT..."
cd "$REPO_ROOT/apps/mobile" && nohup npx expo start > "$LOG_FILE" 2>&1 &
echo "✓ Metro starting in background (logs: $LOG_FILE)"
