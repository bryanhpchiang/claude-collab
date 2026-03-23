#!/bin/bash
# Hook: after Claude stops, check if STATE.md needs updating
# If >60s since last update, spawn haiku to regenerate it

STATE_FILE="/home/exedev/claude-collab/STATE.md"
LOCK_FILE="/tmp/state-update.lock"

# Don't run if another update is already in progress
if [ -f "$LOCK_FILE" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0) ))
  # Clear stale locks older than 120s
  if [ "$LOCK_AGE" -gt 120 ]; then
    rm -f "$LOCK_FILE"
  else
    exit 0
  fi
fi

# Check if STATE.md is older than 60 seconds
if [ -f "$STATE_FILE" ]; then
  LAST_MOD=$(stat -c %Y "$STATE_FILE")
  NOW=$(date +%s)
  AGE=$(( NOW - LAST_MOD ))
  if [ "$AGE" -lt 60 ]; then
    exit 0
  fi
fi

# Create lock and run haiku in background
touch "$LOCK_FILE"

(/home/exedev/.local/bin/claude --model haiku -p "Read /home/exedev/claude-collab/STATE.md and the recent messages in the current conversation. Update STATE.md with a concise structured summary of this multiplayer Jam session. Use these sections (skip empty ones): ## What's Happening, ## Key Decisions, ## Open Questions, ## Who's Doing What. Keep it brief and useful as a quick reference. Write the updated file." --dangerously-skip-permissions 2>/dev/null; rm -f "$LOCK_FILE") &

exit 0
