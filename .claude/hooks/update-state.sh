#!/bin/bash
# Hook: after Claude stops, check if STATE.md needs updating
# If >60s since last update, spawn haiku to regenerate it (incrementally)

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE_FILE="$REPO_ROOT/STATE.md"
TIMESTAMP_FILE="$REPO_ROOT/.state-timestamp"
LOCK_FILE="/tmp/state-update.lock"
MESSAGES_LOG="$HOME/.claude/jam-messages.log"

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

# Read last-processed timestamp (epoch seconds), default to 0 (process all)
LAST_TS=0
if [ -f "$TIMESTAMP_FILE" ]; then
  LAST_TS=$(cat "$TIMESTAMP_FILE" 2>/dev/null || echo 0)
fi

# Find the most recently modified JSONL session files (up to 3)
RECENT_JSONL=$(find "$HOME/.claude/projects" -name "*.jsonl" -type f 2>/dev/null \
  | xargs ls -t 2>/dev/null | head -3)

# Build session context: only JSONL entries with timestamp > LAST_TS
# Each JSONL line is a JSON object; filter by "timestamp" field (ISO or epoch)
SESSION_CONTEXT=""
for f in $RECENT_JSONL; do
  if [ -f "$f" ]; then
    # Extract lines with timestamp newer than LAST_TS (compare as epoch seconds)
    NEW_LINES=$(awk -v last_ts="$LAST_TS" '
      {
        # Try to extract "timestamp" field value
        if (match($0, /"timestamp":"([^"]+)"/, arr)) {
          ts_str = arr[1]
          # Convert ISO timestamp to epoch using date
          cmd = "date -d " ts_str " +%s 2>/dev/null"
          cmd | getline epoch
          close(cmd)
          if (epoch+0 > last_ts+0) print $0
        } else {
          # No timestamp field: include by default
          print $0
        }
      }
    ' "$f" 2>/dev/null | tail -60)
    if [ -n "$NEW_LINES" ]; then
      SESSION_CONTEXT="$SESSION_CONTEXT
--- session: $f (new entries since last run) ---
$NEW_LINES
"
    fi
  fi
done

# Build messages log context: only lines newer than LAST_TS
# Format: 2026-03-25T18:23:11Z [Username]: message
MESSAGES_CONTEXT=""
if [ -f "$MESSAGES_LOG" ]; then
  MESSAGES_CONTEXT=$(awk -v last_ts="$LAST_TS" '
    {
      # Extract ISO timestamp from start of line: 2026-03-25T18:23:11Z
      if (match($0, /^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)/, arr)) {
        ts_str = arr[1]
        cmd = "date -d " ts_str " +%s 2>/dev/null"
        cmd | getline epoch
        close(cmd)
        if (epoch+0 > last_ts+0) print $0
      } else {
        print $0
      }
    }
  ' "$MESSAGES_LOG" 2>/dev/null | tail -50)
fi

# Build existing state context
EXISTING_STATE=""
if [ -f "$STATE_FILE" ]; then
  EXISTING_STATE="$(cat "$STATE_FILE")"
fi

# Capture new timestamp before spawning (ISO format for log, epoch for sidecar)
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOW_EPOCH=$(date +%s)

# Create lock and run haiku in background
touch "$LOCK_FILE"

PROMPT="You are summarizing a multiplayer collaborative coding jam session. Use the information below to write a concise, up-to-date STATE.md file.

## Existing STATE.md (previous summary — treat as base to update from)
$EXISTING_STATE

## New chat messages since last summary (jam-messages.log)
$MESSAGES_CONTEXT

## New Claude session JSONL entries since last summary (structured conversation history)
$SESSION_CONTEXT

Write a new STATE.md with exactly these sections (omit any that have nothing to say):
## What agents are working on NOW
## Who's working on what
## State of the project so far

Keep it brief, factual, and useful as a quick catch-up for someone just joining. Incorporate the existing summary with any new information. Output only the markdown content, nothing else."

(echo "$PROMPT" | claude --model haiku -p "$PROMPT" --dangerously-skip-permissions 2>/dev/null > "$STATE_FILE" && echo "$NOW_EPOCH" > "$TIMESTAMP_FILE"; rm -f "$LOCK_FILE") &

exit 0
