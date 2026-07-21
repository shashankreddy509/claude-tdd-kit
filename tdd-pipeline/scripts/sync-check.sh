#!/bin/bash
# Drift guard: compares the plugin's command/agent files against the live copies
# in ~/.claude/ that local sessions actually run. Exit 1 + a report when they differ.
#
# Usage: scripts/sync-check.sh          # report drift
#        scripts/sync-check.sh --fix    # copy plugin -> live (backs up live first)
#
# NOTE: ~/.claude/commands/ship.md is the OWNER'S PROJECT ship ritual (git mechanics),
# NOT this plugin's ship command — it is deliberately excluded from the pairs below.

set -u
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LIVE_CMD="$HOME/.claude/commands"
LIVE_AGENTS="$HOME/.claude/agents"

# plugin-path : live-path pairs (extend when new files gain live twins)
PAIRS=(
  "$PLUGIN_DIR/commands/build.md:$LIVE_CMD/build.md"
  "$PLUGIN_DIR/commands/implement.md:$LIVE_CMD/implement.md"
)
# agents sync automatically if a live twin exists
for f in "$PLUGIN_DIR"/agents/*.md; do
  base="$(basename "$f")"
  [ -f "$LIVE_AGENTS/$base" ] && PAIRS+=("$f:$LIVE_AGENTS/$base")
done

drift=0
for pair in "${PAIRS[@]}"; do
  plugin="${pair%%:*}"; live="${pair##*:}"
  if ! diff -q "$plugin" "$live" >/dev/null 2>&1; then
    drift=1
    echo "DRIFT: $(basename "$plugin")  (plugin vs $live)"
    if [ "${1:-}" = "--fix" ]; then
      cp "$live" "$live.pre-sync.bak"
      cp "$plugin" "$live"
      echo "  -> synced plugin -> live (backup: $live.pre-sync.bak)"
    fi
  fi
done

if [ "$drift" -eq 0 ]; then
  echo "OK: live copies match the plugin."
elif [ "${1:-}" != "--fix" ]; then
  echo ""
  echo "Live ~/.claude/ copies differ from the plugin. If the plugin is newer:"
  echo "  scripts/sync-check.sh --fix"
  echo "If LIVE is newer, port the live edits into the plugin repo and open a PR."
  exit 1
fi
