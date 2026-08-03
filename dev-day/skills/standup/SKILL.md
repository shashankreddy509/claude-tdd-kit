---
name: standup
description: >-
  Read-only "anything pending?" sweep of live project state — git branch + dirty
  files, open PRs, the deploy gap (latest tag vs origin/main, app-code only), and
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
- **deploy gap**: latest plain `v*` tag (exclude `-rc`) vs `origin/main`; `git diff --name-only <tag>..origin/main`
  filtered to the repo's app-source prefix (see `--app-paths` below). Zero app files → up-to-date; else pending vX.Y.(Z+1).

The script prints, read-only and macOS/bash-3.2 safe (degrading gracefully when gh/tags are absent):

1. **Git working state** — current branch, dirty file count + `git status --short` list, and
   ahead/behind vs upstream. From the list, call out which files are intentional WIP vs unstaged
   feature work.
2. **Open PRs** — `gh pr list --state open` (number · title · head branch). Notes if gh is
   missing/unauth instead of crashing.
3. **Deploy gap (merged ≠ deployed)** — latest `v*` tag (or `git describe`) vs `origin/main`,
   classified by CONTENT not PR title: it lists only app-code files/commits under the app-source
   prefix(es). Default prefixes are permissive (`app/ src/ lib/`); override per-project with
   `--app-paths` / `STANDUP_APP_PATHS`. `status: PENDING` → "deploy pending (vX.Y.(Z+1))";
   `status: NO-OP` (only docs/tooling changed) → "nothing to deploy"; no tag → nothing to report.

4. **Open tickets (if the project has a Jira line in CLAUDE.md `Jira: cloudId=<uuid> key=<KEY>`).**
   This source stays MODEL work (needs the Atlassian MCP) — the script does not touch it.
   Query `project = <KEY> AND statusCategory != Done ORDER BY updated DESC` via the Atlassian
   MCP (`searchJiraIssuesUsingJql`), group by status. List key · summary · status. If no Jira
   line → skip this source (don't fall back to a todo file).

5. **Stale feature-flag entries (ONLY when CLAUDE.md has a `Gating:` line naming a flag store).**
   No line → skip this source silently. Present → read the flag store read-only, using whatever
   helper the project already has (a Firestore doc, LaunchDarkly/Unleash, a config table, an env
   file), and flag entries that look retired-but-present: per-fix keys whose ticket is Done and
   whose fix has been in production ~2 weeks or more. Long-lived feature keys are never flagged.
   Report as a prompt, not an action: this source NEVER writes or deletes a flag entry.
   Retiring one is a code change, not a console click — with fail-closed semantics an absent key
   reads as OFF, so removing the entry while the app still gates on it silently disables the fix.
   The app-side branch goes in the same change (both sides of the gate move together).

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

## Dashboard render + inbox drain (OPTIONAL — skip silently when absent)

A visual standup board is an optional extra. Most repos have none: **if no dashboard tool
resolves, skip this whole section with no message and print the text standup only.** A dead
server or a missing tool NEVER blocks or fails the sweep.

**Resolve the tool, in order — stop at the first hit:**

1. A dashboard script the repo ships under `scripts/` → run it with the project's own interpreter
   (for a Python tool, `.venv/bin/python` when a venv exists, else `python3`).
2. A `Dashboard:` line in the repo's `CLAUDE.md` — also covers the case where the tool lives in a
   SIBLING repo but drives a board for this one:
   ```
   Dashboard: tool=<abs path to the dashboard tool> port=<port> [env=K=V,K=V] [gh_repo=<owner/repo>]
   ```
   Use its `tool`, `port`, and any `env` prefix verbatim.
3. Neither → **no dashboard. Skip.**

Then do TWO things, both wrapped so failure is silent:

1. **Drain first.** `<env> <TOOL> drain` — act on any queued clicks (action→work map:
   `deploy_dev`/`deploy_prod`/`ship`/`pick_ticket`/`reconcile`/`refresh_standup`; a
   `refresh_standup` just means re-run this sweep).
2. **Render after.**
   ```bash
   <env> <TOOL> render standup '<json>'
   ```
   `<json>` = `{branch, dirty_clean, dirty_count, prs:[...], ticket_total, jira_key, label,
   no_deploy?, deploy:{pending,tag,files,files_list}, groups:{"<status>":["KEY summary", …]}}`
   (use generic `groups` keyed by real status names, or the fixed `tickets:{in_review,todo,backlog}`).
   Set `no_deploy:true` for a ship-based project with no prod tag.

**PRs must come from the RESOLVED repo, not the cwd.** When the `Dashboard:` line names a
`gh_repo`, Source 2's `gh pr list` and the deploy gap MUST target it (`gh pr list -R <gh_repo>`),
not whatever repo `gh` defaults to. This is the #1 reason a board "doesn't reflect" a real PR:
the sweep queried the wrong repo. With no `gh_repo`, derive it from `git remote get-url origin`.

**Where the tool drives a board for a repo it does not live in**, that project's own conventions
govern what the sweep may do to its tickets — if its `CLAUDE.md` says comment-only, never move a
ticket's Jira status from here.

The page is live at `http://localhost:<port>`. ADDITIVE — still print the text standup too.

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
