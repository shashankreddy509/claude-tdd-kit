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
MANIFESTS=".claude-plugin/marketplace.json dev-day/.claude-plugin/plugin.json tdd-pipeline/.claude-plugin/plugin.json mods/side-panel/.claude-plugin/plugin.json mods/next-steps/.claude-plugin/plugin.json mods/secret-guard/.claude-plugin/plugin.json"
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
    *-reviewer|*-coordinator|*-analyzer|test-writer|test-runner|implementer|planner|changelog|*-best-practices)
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
# 6. No private details in the shipped plugins.
#    merge-feedback appends session lessons to skill files; a lesson written as a
#    story carries names, home paths and private project details into a public kit.
#    plugin.json and LICENSE are skipped: author and copyright are attribution.
# ---------------------------------------------------------------------------
head_ "6. no private details in dev-day / tdd-pipeline"
LEAKS='/Users/|Shashank|BTC|Desk Hub|personal-assistant|owner ruling|tcl_|the owner'
hits="$(grep -rnE "$LEAKS" dev-day tdd-pipeline --exclude=plugin.json --exclude=LICENSE 2>/dev/null)"
if [ -z "$hits" ]; then
  ok "no private strings ($LEAKS)"
else
  bad "private strings found:"
  printf '%s\n' "$hits" | cut -c1-160 | sed 's/^/        /'
fi

# ---------------------------------------------------------------------------
# 7. Shared references stay identical.
#    Each plugin installs alone, so each ships its own copy; an edit to one copy
#    must reach the other.
# ---------------------------------------------------------------------------
head_ "7. shared references identical"
if cmp -s dev-day/references/jira-mcp.md tdd-pipeline/references/jira-mcp.md; then
  ok "references/jira-mcp.md matches in both plugins"
else
  bad "references/jira-mcp.md differs (or is missing) between dev-day and tdd-pipeline"
fi

# ---------------------------------------------------------------------------
# 8. Open points survive end-session -> start-session.
#    start-session prints "exactly this format", so a template without the Open
#    points slot drops them silently (dev-day 1.13.0 did). end-session must write
#    the section even on a no-work session. Parallel sessions share the file, so
#    end-session must merge into it, never overwrite (two notes were lost 10-09).
# ---------------------------------------------------------------------------
head_ "8. open points carry over"
has() {  # file, sentence regex (newlines joined), label
  if { tr '\n' ' ' < "$1"; } 2>/dev/null | grep -qE "$2"; then ok "$3"; else bad "$3 ($1)"; fi
}
lacks() {  # file, regex, label
  if grep -qE "$2" "$1"; then bad "$3 ($1)"; else ok "$3"; fi
}
has dev-day/skills/start-session/SKILL.md '\*\*Open points:\*\*' "start-session template shows Open points"
has dev-day/skills/start-session/SKILL.md '`## Left off` block.{0,80}newest first' "start-session shows every session's Left off block"
has dev-day/skills/start-session/SKILL.md 'New implementation:.{0,200}Grep for code that already does the job.{0,160}add a parameter to the shared piece' "start-session plan-gate makes inline work reuse before writing new"
has dev-day/skills/end-session/SKILL.md 'Re-read the file right before writing' "end-session re-reads session-notes before writing"
has dev-day/skills/end-session/SKILL.md 'No substantive work[^.]*Open points' "end-session no-work session keeps Open points"
lacks dev-day/skills/end-session/SKILL.md 'OVERWRITE it' "end-session never overwrites session-notes"

# ---------------------------------------------------------------------------
# 9. /ship catches an edit made after the last verified run.
#    HEAD == receipt.sha with a dirty tree is also what a post-review edit looks
#    like; only the receipt's tree fingerprint tells the two apart.
# ---------------------------------------------------------------------------
head_ "9. receipt tree fingerprint"
has tdd-pipeline/references/tree-fingerprint.md 'git write-tree' "tree-fingerprint reference holds the command"
has tdd-pipeline/agents/build-coordinator.md '"tree":' "build-coordinator receipt stamps tree"
has tdd-pipeline/agents/build-coordinator.md 'references/tree-fingerprint\.md' "build-coordinator points at the fingerprint reference"
has tdd-pipeline/commands/ship.md 'references/tree-fingerprint\.md' "ship points at the fingerprint reference"
has tdd-pipeline/commands/ship.md 'differs from `receipt\.tree`.{0,160}\*\*STOP\*\*' "ship STOPs on a tree mismatch"

# ---------------------------------------------------------------------------
# 10. A test the runner never ran is not a pass.
#     xcodebuild only compiles files a target lists; a new test file outside it
#     prints TEST SUCCEEDED with zero tests run.
# ---------------------------------------------------------------------------
head_ "10. new tests actually run"
has tdd-pipeline/agents/build-coordinator.md 'ran ZERO tests.{0,200}\*\*STOP\*\*' "verify-red STOPs when the filtered run ran no tests"
has tdd-pipeline/references/test-counts.md 'Executed N tests' "test-counts names the xcodebuild count line"
has tdd-pipeline/agents/test-writer.md 'PBXFileSystemSynchronizedRootGroup' "test-writer tells a classic xcodeproj from synced folders"
for f in test-writer implementer; do
  has "tdd-pipeline/agents/$f.md" '### iOS / Swift' "$f has a Swift section"
done
has tdd-pipeline/agents/code-quality-reviewer.md '\*\*Swift:\*\*' "code-quality-reviewer has a Swift section"
has tdd-pipeline/agents/memory-analyzer.md 'AnyCancellable' "memory-analyzer covers Combine subscriptions"

# ---------------------------------------------------------------------------
# 11. Every stack, not only compiled ones.
#     A Python/JS test importing a not-yet-written module errors before any
#     assertion; the test command must come from the project owning the plan's
#     files; Gradle prints no count on success, so exit 0 proves nothing ran.
# ---------------------------------------------------------------------------
head_ "11. stack-generic pipeline"
lacks tdd-pipeline/agents/test-writer.md 'On compiled stacks' "test-writer stubs on every stack"
has tdd-pipeline/agents/test-writer.md 'stubs above are not implementation' "test-writer: a stub is not implementation"
has tdd-pipeline/agents/build-coordinator.md 'never tell it to skip a source file or a stub' "coordinator never bans test-writer's stubs"
has tdd-pipeline/agents/build-coordinator.md 'Compile or import error naming ONLY' "verify-red takes a missing-module import error as red"
has tdd-pipeline/agents/build-coordinator.md '\*\*STOP\*\* \(except a run that +stopped on the compile or import error' "the zero-tests STOP yields to a missing-module red"
has tdd-pipeline/agents/build-coordinator.md 'closest parent' "test command comes from the project owning the plan's files"
has tdd-pipeline/agents/build-coordinator.md 'cd <dir> &&' "test command runs in the owning project's folder"
has tdd-pipeline/agents/build-coordinator.md 'two different projects.{0,40}\*\*STOP\*\*' "a two-stack change STOPs for a chained Test: line"
has tdd-pipeline/references/test-counts.md 'TEST-\*\.xml' "test-counts reads Gradle's XML results"
has tdd-pipeline/references/test-counts.md 'no test files' "test-counts reads Go's zero-test line"
has tdd-pipeline/references/test-counts.md 'ONE variant' "test-counts reads one Android variant, not both"
for f in agents/test-runner.md agents/build-coordinator.md; do
  has "tdd-pipeline/$f" 'references/test-counts\.md' "$f points at the count reference"
done
NON_APP="$(sed -n "s/^NON_APP='\(.*\)'$/\1/p" dev-day/skills/standup/scripts/standup.sh)"
miss=""
for p in app/src/test/A.kt app/src/androidTest/B.kt pkg/tests/x.py test_x.py bitrise.yml fastlane/Fastfile Jenkinsfile; do
  printf '%s\n' "$p" | grep -qE "$NON_APP" || miss="$miss $p"
done
for p in app/src/main/A.kt src/latest/x.py contest_x.py; do
  printf '%s\n' "$p" | grep -qE "$NON_APP" && miss="$miss !$p"
done
if [ -n "$NON_APP" ] && [ -z "$miss" ]; then ok "standup NON_APP sorts test/CI paths from app code"
else bad "standup NON_APP misses:$miss"; fi

# ---------------------------------------------------------------------------
# 12. No stack is the default.
#     Rules written for one stack read as the kit's rules for every stack: a
#     merged Android/Kotlin section, a DI framework added unasked, a README
#     claiming rule sections that do not exist.
# ---------------------------------------------------------------------------
head_ "12. no default stack"
for f in test-writer implementer; do
  has "tdd-pipeline/agents/$f.md" '### Kotlin .{0,250}### Android ' "$f splits Kotlin from Android"
done
lacks tdd-pipeline/agents/implementer.md 'Hilt' "implementer adds no DI framework unasked"
lacks README.md 'Hilt by default' "README names no default DI framework"
for f in test-writer implementer; do
  for h in '### \.NET / C#' '### Go'; do
    has "tdd-pipeline/agents/$f.md" "$h" "$f has a $h section"
  done
done
has tdd-pipeline/agents/code-quality-reviewer.md '\*\*C#:\*\*.{0,250}\*\*Go:\*\*' "code-quality-reviewer has C# and Go entries"
for f in tdd-pipeline/agents/code-review-coordinator.md tdd-pipeline/agents/kotlin-best-practices.md README.md; do
  has "$f" '`\.kt` / `\.kts` files' "$f starts the Kotlin reviewer on .kts too"
done
has tdd-pipeline/agents/code-review-coordinator.md 'desktop / CLI / library' "review platform buckets go past mobile and web"
has tdd-pipeline/agents/build-coordinator.md '`-run` for `go test`' "verify-red knows the go test filter"
has tdd-pipeline/agents/build-coordinator.md '`poetry install`.{0,250}`composer install`' "dependency check covers a Python venv and composer vendor/"
has tdd-pipeline/agents/changelog.md 'test_orders\.py' "changelog shows a second, non-Kotlin example"
lacks README.md 'each have their own' "README claims rule sections only for stacks that have them"
lacks tdd-pipeline/README.md 'via stack-detected test commands and per-stack rule sections' "tdd-pipeline README claims rule sections only for stacks that have them"
has dev-day/skills/groom/SKILL.md '\*\*Other:\*\*' "groom maps stacks beyond web and mobile"
lacks dev-day/skills/groom/SKILL.md 'screen → ViewModel/presenter → repository chain' "groom names no single client architecture"
has dev-day/skills/groom-panel/SKILL.md 'any other toolkit' "groom-panel renders the toolkit the user named"
has dev-day/skills/prove-pre-existing/SKILL.md '`--- FAIL:`' "prove-pre-existing reads Go traces"

# ---------------------------------------------------------------------------
# 13. References resolve from the user's repo.
#     Agents and commands run with cwd = the user's repo, so a bare
#     `references/x.md` sent live runs into `find /` (120s timeout) or a stale
#     cached plugin copy. ${CLAUDE_PLUGIN_ROOT} is swapped for the real path.
# ---------------------------------------------------------------------------
head_ "13. plugin-rooted references"
bare="$(grep -rnE 'references/[a-z-]+\.md' tdd-pipeline/agents tdd-pipeline/commands | sed 's|\${CLAUDE_PLUGIN_ROOT}/references/||g' | grep -E 'references/[a-z-]+\.md' || true)"
if [ -z "$bare" ]; then ok "no bare references/ path in tdd-pipeline"; else bad "bare references/ path: $(printf '%s' "$bare" | head -1)"; fi
miss=""
for f in $(grep -rhoE '\$\{CLAUDE_PLUGIN_ROOT\}/references/[a-z-]+\.md' tdd-pipeline | sort -u | sed 's|.*/references/||'); do
  [ -f "tdd-pipeline/references/$f" ] || miss="$miss $f"
done
if [ -z "$miss" ]; then ok "every plugin-rooted reference exists"; else bad "missing references:$miss"; fi

# ---------------------------------------------------------------------------
head_ "result"
printf '  %d passed, %d failed\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
