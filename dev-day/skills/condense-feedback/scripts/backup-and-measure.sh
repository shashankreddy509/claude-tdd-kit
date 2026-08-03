#!/usr/bin/env bash
# backup-and-measure.sh — safety backup + before/after measurement for /condense-feedback.
#
# The MODEL does the actual condensing. This script only:
#   1. (default)  refuses if <file> is missing, makes a TIMESTAMPED backup that NEVER
#      clobbers an existing one, and prints the ORIGINAL line + char counts.
#   2. (--after)  re-run on the SAME file post-condense to print the new counts and the
#      computed % reduction, so the ~75-85% shrink can be verified.
#
# bash 3.2 / macOS compatible.
#
# Usage:
#   backup-and-measure.sh <file>            # backup + before-count
#   backup-and-measure.sh --after <file>    # after-count + % reduction

set -u

usage() {
  echo "usage: $0 <file>            # backup + before-count" >&2
  echo "       $0 --after <file>    # after-count + % reduction" >&2
  exit 2
}

# ---- parse args ----------------------------------------------------------
MODE="before"
FILE=""
if [ "${1:-}" = "--after" ]; then
  MODE="after"
  FILE="${2:-}"
elif [ $# -ge 1 ]; then
  FILE="$1"
fi
[ -n "$FILE" ] || usage

if [ ! -f "$FILE" ]; then
  echo "error: file not found: $FILE" >&2
  exit 1
fi

# ---- helpers -------------------------------------------------------------
# wc pads with leading spaces on macOS; strip them.
count_lines() { wc -l < "$1" | tr -d ' '; }
count_chars() { wc -c < "$1" | tr -d ' '; }

# Find the most-recent existing timestamped backup for this file, if any.
newest_backup() {
  ls -1t "$FILE".bak-* 2>/dev/null | head -n 1
}

# ---- after mode ----------------------------------------------------------
if [ "$MODE" = "after" ]; then
  BAK="$(newest_backup)"
  if [ -z "$BAK" ] || [ ! -f "$BAK" ]; then
    echo "error: no backup ($FILE.bak-*) found; run without --after first" >&2
    exit 1
  fi

  OLD_L="$(count_lines "$BAK")"
  OLD_C="$(count_chars "$BAK")"
  NEW_L="$(count_lines "$FILE")"
  NEW_C="$(count_chars "$FILE")"

  # integer % reduction (guard divide-by-zero)
  if [ "$OLD_L" -gt 0 ]; then
    RED_L=$(( (OLD_L - NEW_L) * 100 / OLD_L ))
  else
    RED_L=0
  fi
  if [ "$OLD_C" -gt 0 ]; then
    RED_C=$(( (OLD_C - NEW_C) * 100 / OLD_C ))
  else
    RED_C=0
  fi

  echo "backup:  $BAK"
  echo "lines:   $OLD_L -> $NEW_L  (-${RED_L}%)"
  echo "chars:   $OLD_C -> $NEW_C  (-${RED_C}%)"
  echo "target:  75-85% reduction"
  exit 0
fi

# ---- before mode (backup + measure) --------------------------------------
STAMP="$(date +%Y%m%d-%H%M%S)"
BAK="$FILE.bak-$STAMP"

# NEVER overwrite an existing backup — the whole point of the guard.
if [ -e "$BAK" ]; then
  echo "error: backup already exists, refusing to overwrite: $BAK" >&2
  exit 1
fi

cp "$FILE" "$BAK" || { echo "error: backup failed" >&2; exit 1; }

echo "backup:  $BAK"
echo "lines:   $(count_lines "$FILE")"
echo "chars:   $(count_chars "$FILE")"
echo "(condense the file in place, then re-run: $0 --after \"$FILE\")"
