---
name: standup
description: >-
  Read-only "anything pending?" sweep of live project state — git branch + dirty
  files, open PRs, the deploy gap (latest tag vs origin/<default>, app-code only), and
  open Jira issues (statusCategory != Done). Answers "what's left / anything
  pending / what's next" in one shot WITHOUT acting on anything. Use on '/standup',
  "anything pending?", "what's next", "where are we". Never commits, ships, or
  deploys — it only reports the standup.
---

# standup

One read-only sweep that answers "anything pending?" from LIVE state, never from memory or a
todo file. Sweeps four sources and prints a tight status. **Acts on nothing** — no commit,
push, merge, tag, or transition. If the sweep finds work, it lists it and stops; the user
decides what to do next.

## The four sources

Run the deterministic sweep (sources 1–3) via the script, then add the Jira source, then print the
combined standup.

**Sources 1–3 — git + gh + deploy gap — are emitted as RAW facts by one bundled script.**
Run it and read its output; do NOT re-derive these by hand.

**Resolve `SKILL_DIR` first.** Set it to the **absolute path of the directory containing THIS
SKILL.md you just Read** — your harness reported that path in the Read result. The script is always
a direct sibling of this file (`SKILL_DIR/scripts/standup.sh`), in every install layout:

```
Read ~/.claude/plugins/cache/<marketplace>/dev-day/<ver>/skills/standup/SKILL.md → SKILL_DIR=…/skills/standup
Read ~/.claude/skills/standup/SKILL.md                                           → SKILL_DIR=~/.claude/skills/standup
```

Substitute that literal path below. This works on every harness without relying on a
harness-specific environment variable.

```bash
"${SKILL_DIR}/scripts/standup.sh"     # optionally: --app-paths "app/ src/"  (or STANDUP_APP_PATHS=)
```

Run it from the repo you are reporting on — it reads the CURRENT working directory's git state, not
`SKILL_DIR`'s.

**Fallback if that script cannot be run** (not found under `SKILL_DIR`, or not executable). Do NOT
abort; derive sources 1–3 by hand, read-only:
- **git**: `git rev-parse --abbrev-ref HEAD`, `git status --short`, `git rev-list --left-right --count @{u}...HEAD`.
- **PRs**: `gh pr list --state open --json number,title,headRefName` — targeting the RESOLVED repo
  (`-R <owner/repo>`), not necessarily the cwd (see the dashboard section below).
- **deploy gap**: latest plain `v*` tag (exclude `-rc`) vs `origin/<default>` (the script's `default_branch:`; by hand
  `git ls-remote --symref origin HEAD`); `git diff --name-only <tag>..origin/<default>`
  filtered to the repo's app-source prefix (see `--app-paths` below). Zero app files → up-to-date; else pending vX.Y.(Z+1).

The script prints, read-only and macOS/bash-3.2 safe (degrading gracefully when gh/tags are absent):

1. **Git working state** — current branch, dirty file count + `git status --short` list, and
   ahead/behind vs upstream. From the list, call out which files are intentional WIP vs unstaged
   feature work.
2. **Open PRs** — `gh pr list --state open` (number · title · head branch). Notes if gh is
   missing/unauth, or "PR list unavailable" if gh fails or the remote is not GitHub, instead of
   crashing; "(none open)" only on a successful empty list.
3. **Deploy gap (merged ≠ deployed)** — latest `v*` tag (or `git describe`) vs `origin/<default>`,
   classified by CONTENT not PR title: it lists only app-code files/commits. By default every
   changed file counts except docs, tests and CI config; restrict to given prefixes per-project with
   `--app-paths` / `STANDUP_APP_PATHS`. `status: PENDING` → "deploy pending (vX.Y.(Z+1))";
   `status: NO-OP` (only docs/tooling changed) → "nothing to deploy"; no tag → nothing to report.

4. **Open tickets (if the project has a Jira line in CLAUDE.md `Jira: cloudId=<uuid> key=<KEY>`).**
   This source stays MODEL work (needs the Atlassian MCP) — the script does not touch it.
   Query `project = <KEY> AND statusCategory != Done ORDER BY updated DESC` via the JQL-search
   verb, resolved as `/start-session` step 2 does, group by status. List key · summary · status. If no Jira
   line → skip this source (don't fall back to a todo file).

5. **Optional: stale feature-flag entries.** Only when CLAUDE.md has a `Gating:` line naming a flag
   store; read it read-only and report retired-but-present entries as a prompt, never an action.
   No line → skip silently.

## Output

```
standup — <repo> @ <branch>
• dirty:    <N files>  (WIP: …, unstaged-feature: …)  | clean
• PRs open: #N <title> …                              | none
• deploy:   PENDING vX.Y.Z (<app files changed>)      | up-to-date  | no-op (docs only)
• tickets:  <N> open — <key summary [status]> …       | none / no Jira configured
• flags:    <N> stale — <flag key (shipped <date>)> …        | clean | n/a (no flag store)
VERDICT: <one line — e.g. "PR #132 awaiting merge; deploy pending once merged" or "nothing pending">
```

## Optional dashboard hook

If the repo has a dashboard tool (a script under `scripts/`, or a `Dashboard:` line in CLAUDE.md naming
it), render the standup to it after printing the text one. No tool resolves → skip silently; a dead
tool never blocks the sweep. PRs always come from the resolved repo (`gh pr list -R <owner/repo>`),
not the cwd. The text standup is always printed.

## Guards
- **Read-only.** Never act — no commit/push/merge/tag/transition. List, don't do.
- **Live state only.** `scripts/standup.sh` re-derives git/gh/deploy from live state each run;
  the model re-derives Jira from the MCP. Never trust a todo file or memory.
- **Content over title** for the deploy gap — a docs-titled PR can ship app code; the script
  greps the app-source prefix(es), so judge by its `app_files_changed`/`status`, not by PR name.
- **Merged ≠ deployed** — a merged PR still shows as a deploy gap until it's tagged + shipped.
- **Project-agnostic:** the script defaults to permissive app-source prefixes; if a repo's real
  prefix differs (from its CLAUDE.md / layout), pass `--app-paths`. Discover Jira coordinates from
  CLAUDE.md; skip the Jira source when no Jira line exists.
