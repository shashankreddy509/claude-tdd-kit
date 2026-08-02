#!/usr/bin/env bash
# validate.sh — structural validation for the claude-tdd-kit marketplace.
#
# A plugin here is markdown, not executable code, so there is no unit test to run.
# What CAN break silently is the wiring: a manifest that stops parsing, a marketplace
# entry pointing at a directory that moved, a coordinator spawning an agent whose file
# was renamed, a shell script with a syntax error, or the two plugin versions drifting
# apart. Each of those ships green and fails at the user's install. These checks catch
# them.
#
# Usage: tests/validate.sh              # run all checks
#        tests/validate.sh --tag v1.3.0 # also assert manifests match this release tag
#
# Exit 0 = all checks passed. Exit 1 = at least one failed.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

EXPECTED_TAG=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag) EXPECTED_TAG="${2:-}"; shift 2 || shift ;;
    --tag=*) EXPECTED_TAG="${1#*=}"; shift ;;
    -h|--help) echo "usage: tests/validate.sh [--tag vX.Y.Z]"; exit 0 ;;
    *) shift ;;
  esac
done

PASS=0
FAIL=0

ok()   { printf '  ok    %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }
head_() { printf '\n== %s ==\n' "$1"; }

# Prefer python3 for JSON; fall back to jq. One of the two must exist.
if command -v python3 >/dev/null 2>&1; then
  json_get() { python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));k=sys.argv[2].split(".");v=d
for p in k:
    v = v[p] if p else v
print(v)' "$1" "$2" 2>/dev/null; }
  json_ok()  { python3 -c 'import json,sys;json.load(open(sys.argv[1]))' "$1" 2>/dev/null; }
elif command -v jq >/dev/null 2>&1; then
  json_get() { jq -r ".$2" "$1" 2>/dev/null; }
  json_ok()  { jq -e . "$1" >/dev/null 2>&1; }
else
  echo "FATAL: need python3 or jq to validate JSON."
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Every manifest is valid JSON.
#    A trailing comma here means every install of the marketplace fails.
# ---------------------------------------------------------------------------
head_ "1. manifests parse"
MANIFESTS=".claude-plugin/marketplace.json dev-day/.claude-plugin/plugin.json tdd-pipeline/.claude-plugin/plugin.json"
for m in $MANIFESTS; do
  if [ ! -f "$m" ]; then
    bad "$m (missing)"
  elif json_ok "$m"; then
    ok "$m"
  else
    bad "$m (invalid JSON)"
  fi
done

# ---------------------------------------------------------------------------
# 2. Every marketplace entry points at a real plugin.
#    Renaming or moving a plugin directory without updating marketplace.json
#    produces a marketplace that adds cleanly and then cannot install anything.
# ---------------------------------------------------------------------------
head_ "2. marketplace sources resolve"
if command -v python3 >/dev/null 2>&1; then
  SOURCES="$(python3 -c '
import json
d = json.load(open(".claude-plugin/marketplace.json"))
for p in d.get("plugins", []):
    print(p.get("name", "?"), p.get("source", "?"))
' 2>/dev/null)"
else
  SOURCES="$(jq -r '.plugins[] | "\(.name) \(.source)"' .claude-plugin/marketplace.json 2>/dev/null)"
fi

if [ -z "$SOURCES" ]; then
  bad "marketplace.json declares no plugins"
else
  # Feed the loop from a here-string, NOT a pipe: a piped while runs in a subshell
  # and its PASS/FAIL increments are discarded, so a real failure would print but
  # still exit 0.
  while read -r pname psrc; do
    [ -z "$pname" ] && continue
    clean="${psrc#./}"
    if [ ! -d "$clean" ]; then
      bad "$pname -> $psrc (directory missing)"
    elif [ ! -f "$clean/.claude-plugin/plugin.json" ]; then
      bad "$pname -> $psrc (no .claude-plugin/plugin.json)"
    else
      ok "$pname -> $psrc"
    fi
  done <<EOF
$SOURCES
EOF
fi

# ---------------------------------------------------------------------------
# 3. Every agent referenced in prose exists as a file.
#    The coordinators spawn agents by name in backticks ("Spawn agent: `test-writer`",
#    "- `security-reviewer` — pass the review bundle"). Rename an agent file and the
#    coordinator keeps referring to a name that no longer resolves — the stage silently
#    does not run.
# ---------------------------------------------------------------------------
head_ "3. referenced agents exist"
AGENT_DIR="tdd-pipeline/agents"
REFS="$(grep -rhoE '`[a-z][a-z0-9-]*`' \
          "$AGENT_DIR"/*.md \
          tdd-pipeline/commands/*.md \
          tdd-pipeline/skills/*/SKILL.md 2>/dev/null \
        | tr -d '`' | sort -u)"

MISSING=0
for ref in $REFS; do
  # Only consider names that look like this kit's agents, so ordinary backticked
  # prose (`main`, `git`, `false`) is not treated as an agent reference.
  case "$ref" in
    *-reviewer|*-coordinator|*-analyzer|test-writer|test-runner|implementer|planner|changelog|kotlin-best-practices)
      if [ -f "$AGENT_DIR/$ref.md" ]; then
        ok "$ref"
      else
        bad "$ref (referenced but $AGENT_DIR/$ref.md does not exist)"
        MISSING=$((MISSING + 1))
      fi
      ;;
  esac
done
[ "$MISSING" -eq 0 ] && [ -z "$REFS" ] && bad "no agent references found — the matcher is probably broken"

# Reverse direction: an agent file whose frontmatter name disagrees with its filename
# will not resolve when spawned by filename.
head_ "3b. agent frontmatter name matches filename"
for f in "$AGENT_DIR"/*.md; do
  base="$(basename "$f" .md)"
  # strip optional surrounding quotes — kotlin-best-practices quotes its name
  fmname="$(grep -m1 '^name:' "$f" | sed 's/^name:[[:space:]]*//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')"
  if [ "$base" = "$fmname" ]; then
    ok "$base"
  else
    bad "$base (frontmatter says '$fmname')"
  fi
done

# ---------------------------------------------------------------------------
# 4. Shell scripts are syntactically valid.
#    These ship to other machines; a syntax error is a broken install, not a bad run.
# ---------------------------------------------------------------------------
head_ "4. shell scripts parse"
SCRIPTS="$(find . -name '*.sh' -not -path './.git/*' | sort)"
for s in $SCRIPTS; do
  if bash -n "$s" 2>/dev/null; then
    ok "$s"
  else
    bad "$s (bash -n failed)"
  fi
done

if command -v shellcheck >/dev/null 2>&1; then
  head_ "4b. shellcheck"
  for s in $SCRIPTS; do
    if shellcheck -S error "$s" >/dev/null 2>&1; then
      ok "$s"
    else
      bad "$s (shellcheck errors)"
      shellcheck -S error "$s" 2>&1 | sed 's/^/        /'
    fi
  done
else
  printf '\n  note  shellcheck not installed — skipping (bash -n still ran)\n'
fi

# ---------------------------------------------------------------------------
# 5. Versions agree.
#    Both plugins ship from one repo at one version. Drift between them, or between
#    them and the release tag, is exactly the "advertises v1.0.0 with no release"
#    contradiction this check exists to prevent.
# ---------------------------------------------------------------------------
head_ "5. versions agree"
DEV_V="$(json_get dev-day/.claude-plugin/plugin.json version)"
TDD_V="$(json_get tdd-pipeline/.claude-plugin/plugin.json version)"

if [ -z "$DEV_V" ] || [ -z "$TDD_V" ]; then
  bad "could not read a version from one of the plugin manifests"
elif [ "$DEV_V" = "$TDD_V" ]; then
  ok "dev-day and tdd-pipeline both at $DEV_V"
else
  bad "version drift: dev-day=$DEV_V tdd-pipeline=$TDD_V"
fi

if [ -n "$EXPECTED_TAG" ]; then
  want="${EXPECTED_TAG#v}"
  if [ "$DEV_V" = "$want" ]; then
    ok "manifests match release tag $EXPECTED_TAG"
  else
    bad "release tag $EXPECTED_TAG but manifests say $DEV_V"
  fi
fi

# ---------------------------------------------------------------------------
head_ "result"
printf '  %d passed, %d failed\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
