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
has tdd-pipeline/agents/code-review-coordinator.md 'review not run.{0,80}Critical' "review coordinator reports a review with no specialists as Critical"
has tdd-pipeline/agents/build-coordinator.md 'tools: Read, Bash, Write, Task' "build-coordinator can Write its receipt (a worktree session refuses heredocs)"
has tdd-pipeline/agents/build-coordinator.md 'Write tool, never a shell heredoc' "build-coordinator writes the receipt with Write, not a heredoc"
has tdd-pipeline/agents/build-coordinator.md 'tasks/review/<TICKET>\.diff' "build-coordinator hands the reviewer the literal diff as a file"
has tdd-pipeline/agents/code-review-coordinator.md 'pass the same path to every specialist' "review coordinator passes the diff file to its specialists"
has tdd-pipeline/commands/ship.md 'Cap it at 2 warning-fix rounds' "ship caps the warning-fix loop"
has tdd-pipeline/commands/ship.md 'Must-fix has come back' "ship checks an earlier Must-fix has not returned"
has tdd-pipeline/commands/merged.md 'fetch --prune origin' "merged prunes before branch -d"
has tdd-pipeline/commands/merged.md 'ls-remote --heads origin' "merged checks the remote branch still exists before deleting it"
has tdd-pipeline/agents/build-coordinator.md 'references/tree-fingerprint\.md' "build-coordinator points at the fingerprint reference"
has tdd-pipeline/commands/ship.md 'references/tree-fingerprint\.md' "ship points at the fingerprint reference"
lacks tdd-pipeline/references/tree-fingerprint.md '\$\(' "tree-fingerprint has no command substitution (a worktree session refuses chained git)"
has tdd-pipeline/references/tree-fingerprint.md 'one call each' "tree-fingerprint runs its steps as separate calls"
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
has tdd-pipeline/agents/test-writer.md 'not a warnings flag' "test-writer: cleanup red is a behaviour assertion, not a warnings flag"
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
for f in build-coordinator code-review-coordinator; do
  lacks "tdd-pipeline/agents/$f.md" 'TaskOutput' "$f names no TaskOutput (gone from Claude Code)"
  has "tdd-pipeline/agents/$f.md" 'every spawn passes `run_in_background: false`' "$f spawns in the foreground (claude -p does not wait for background children)"
done
has tdd-pipeline/agents/code-review-coordinator.md 'not returned`.{0,120}partial' "review coordinator marks a missing reviewer as a partial report"
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
# 14. /ship in a ticket's worktree + review-fix runs (PA-103, PA-104).
#     Step 4 used to rebranch receipt work onto a newer main after step 0's gate
#     passed, and a keyless worktree-agent branch skipped the gate entirely.
#     Fixing review findings needed a hand-written coordinator prompt.
# ---------------------------------------------------------------------------
head_ "14. worktree ship + review-fix runs"
has tdd-pipeline/commands/ship.md '`receipt\.ticket` differs.{0,80}\*\*STOP\*\*' "ship STOPs on a receipt for another ticket"
has tdd-pipeline/commands/ship.md 'worktree-agent-<id>.{0,200}ask the user for the key, never skip' "ship asks for the key instead of skipping the gate"
has tdd-pipeline/commands/ship.md 'never rebranch onto a newer' "ship keeps receipt work on the base the suite ran on"
lacks tdd-pipeline/commands/ship.md '^   - If the work is a chore UNRELATED' "ship no longer rebases verified work after the gate"
has tdd-pipeline/agents/build-coordinator.md '`## Review fixes` needs the earlier run.{0,120}skip Stages 1, 1\.5 and 1\.6' "coordinator review-fix run skips only the test-writing stages"
has tdd-pipeline/agents/build-coordinator.md 'skip Stages 1, 1\.5 and 1\.6.{0,120}`red` stays as recorded' "review-fix run never re-stamps red"
has tdd-pipeline/agents/build-coordinator.md 'Do not skip stages.{0,80}`## Review fixes`' "no-skip rule names its one exception"
has tdd-pipeline/agents/implementer.md '`## Review fixes`.{0,200}names that test' "implementer edits a test only when a finding names it"
has tdd-pipeline/commands/implement.md '`## Review fixes`' "implement documents review-fix runs"

# ---------------------------------------------------------------------------
# 15. Jira only in a repo wired to it.
#     /implement moved a ticket for a key taken from a plan filename in a repo
#     with no Jira: line; the reference's site fallback would pick any project.
# ---------------------------------------------------------------------------
head_ "15. Jira only when wired"
for f in tdd-pipeline/references/jira-mcp.md dev-day/references/jira-mcp.md; do
  has $f 'No line.{0,40}skip every Jira step' "jira-mcp skips Jira when CLAUDE.md has no Jira line"
  has $f 'plan filename or branch name never reaches Jira' "a filename key alone never reaches Jira"
  has $f 'else, only for a key the user named' "site fallback only for a user-named key"
done

# ---------------------------------------------------------------------------
# 16. Epic intake + worktree cleanup (PA-105, PA-108 slice).
#     The kit had no dependency logic: nothing read Jira issue links, and a blocker
#     "Done" in Jira is not the same as its code on the default branch. /merged
#     ran `git branch -d` on a branch still checked out in a worktree, which fails.
# ---------------------------------------------------------------------------
head_ "16. epic intake + worktree cleanup"
E=tdd-pipeline/commands/build-epic.md
has $E 'issuelinks' "build-epic reads blockers from Jira issue links"
has $E "git log origin/<default> --format='%h %s'.{0,20}grep -E" "build-epic counts a key merged only from an origin subject line"
lacks $E 'git log[^`]*--grep' "build-epic never greps whole commit messages (a body mention is not a merge)"
has $E 'issuelinks.{0,200}missing from every row.{0,120}titles only' "build-epic warns when Jira drops issuelinks"
has $E '\[ -e package\.json \]' "build-epic tests each worktree marker on its own (zsh aborts on an unmatched glob)"
lacks $E "grep '\\\\b" "build-epic grep avoids \\b (macOS git -E matches nothing with it)"
has $E 'never from Jira status' "build-epic never trusts Jira status for a blocker"
has $E '`\.worktreeinclude`.{0,120}STOP' "build-epic STOPs a JS/iOS repo with no .worktreeinclude"
has $E 'Dry run only.{0,80}no build' "build-epic is a dry run"
has $E '\*\*merged, awaiting Done\*\*.{0,120}own key' "build-epic tags a child already on the default branch"
has $E '\*\*in flight\*\*.{0,120}In Progress' "build-epic never offers a child already in progress"
has $E 'range subject.{0,40}owner may close' "build-epic flags a key that only sits in a range subject"
has $E 'worktree add --no-track -b' "build-epic worktree command does not track origin (a bare push would hit the default branch)"
has $E '`issuelinks`, `description`' "build-epic reads descriptions so owner-step can be judged"
has $E "Judge it from each row.s .description., never the title alone" "build-epic owner-step reads the description, not the title"
has $E 'merged, still <status>' "build-epic keeps a merged blocker BLOCKED while it is still being verified"
has tdd-pipeline/commands/merged.md 'git worktree remove <path>.{0,200}git branch -d' "merged removes the worktree before deleting the branch"
has tdd-pipeline/commands/merged.md 'tasks/receipts/<KEY>\.json.{0,200}cmp' "merged saves the worktree plan + receipt before removing it"
has tdd-pipeline/commands/merged.md 'from the main checkout' "merged stops when run inside the branch's worktree"
for f in tdd-pipeline/references/jira-mcp.md dev-day/references/jira-mcp.md; do
  has $f 'is blocked by.{0,80}inwardIssue' "jira-mcp says where blockers live"
  has $f 'drop `issuelinks`.{0,120}view' "jira-mcp warns some servers drop issuelinks in the default view"
done
has README.md 'build-epic' "README lists build-epic"
has tdd-pipeline/README.md '`build-epic`' "tdd-pipeline README lists build-epic"

# ---------------------------------------------------------------------------
# 17. Epic run loop, sequential (PA-106). By-hand runs 2 + 3: the test command
#     came from session memory, `git -C <main> worktree add` was refused inside a
#     worktree, and switching worktrees mid-build lost a coordinator's receipt.
# ---------------------------------------------------------------------------
head_ "17. epic run loop (sequential)"
has $E 'Build the <B> buildable tickets one at a time\?' "build-epic asks before running the loop"
has $E '`Test:` line.{0,120}ask the user once.{0,200}never from (session )?memory' "build-epic loop takes the test command from Test: or the user, never memory"
has $E 'worktree add --no-track -b feat/<KEY>-<slug> <repo>/\.claude/worktrees/<KEY>' "build-epic loop adds each worktree by absolute path"
has $E 'first 4 words of the summary.{0,40}max 30' "build-epic loop names the slug"
has $E 'ToolSearch.{0,40}EnterWorktree|EnterWorktree.{0,80}ToolSearch' "build-epic loop loads the deferred EnterWorktree tool"
has $E 'Never call EnterWorktree while a build' "build-epic loop never switches worktree mid-build"
has $E 'Skip ticket.{0,40}Stop loop' "build-epic loop offers skip and stop"
has $E '`/tdd-pipeline:merged <KEY>` from the main checkout' "build-epic loop runs merged from the main checkout"
has $E 're-run Steps 1-3' "build-epic loop re-reads the epic after the last ticket"
has $E 'never moves a ticket to Done' "build-epic loop never closes a ticket"
has $E 'add `Test: <command>` as its own line to each plan' "build-epic loop hands the user's test command over in the plan"
has tdd-pipeline/agents/build-coordinator.md 'else a `Test: <command>` line in the plan file' "coordinator reads a plan Test: line when CLAUDE.md has none"

# ---------------------------------------------------------------------------
# 18. Plan gate under worktree isolation (run 4). `eval "$PLAN_GATE_CMD"` was
#     refused inside a worktree session; the expanded literal line ran fine.
# ---------------------------------------------------------------------------
head_ "18. plan gate without eval"
for f in tdd-pipeline/commands/implement.md tdd-pipeline/commands/build.md; do
  lacks $f 'eval "\$PLAN_GATE_CMD"' "plan gate never runs through eval (worktree isolation refuses it)"
done
has tdd-pipeline/commands/implement.md 'printenv PLAN_GATE_CMD.{0,200}literal' "implement expands the gate command once and runs it as a literal line"
has tdd-pipeline/commands/build.md '<gate> record.{0,120}implement' "build reuses implement's gate expansion"

# ---------------------------------------------------------------------------
# 19. Epic run 5 (PA-127). A review that spawned no reviewers still wrote a
#     clean receipt and /ship passed it; the loop's approval question needed
#     6 options (max 4); /merged left tasks/review/<KEY>.diff in the worktree.
# ---------------------------------------------------------------------------
head_ "19. review proves it ran + loop fixes"
R=tdd-pipeline/agents/code-review-coordinator.md
C=tdd-pipeline/agents/build-coordinator.md
S=tdd-pipeline/commands/ship.md
has $R '### Reviewers run' "review report lists the reviewers that returned"
has $C '"reviewers": \[' "receipt schema carries review.reviewers"
has $C 'review.reviewers.{0,200}Reviewers run' "coordinator copies reviewers from the report, never from itself"
has $C 'code-review-coordinator.{0,20}Never review inline or skip this spawn' "coordinator never replaces Stage 4 with its own review"
has $S 'review.reviewers. missing or empty.{0,80}STOP' "ship stops when no reviewer returned"
has $E 'exactly these four options: .{0,40}Approve' "loop names the four approval options"
has $E 'skip .{0,40}plan mode' "loop skips /build's plan mode"
has tdd-pipeline/commands/merged.md 'tasks/review/<KEY>\.diff' "merged saves the review diff before removing the worktree"

# ---------------------------------------------------------------------------
head_ "result"
printf '  %d passed, %d failed\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
