Encodes the "stage and commit" ritual: **verify (receipt gate)** → scope → branch → **write the commit message from what is actually staged** → commit → push → open PR to the default branch → move the Jira issue to In Review. **NO merge** (merging is the reviewer's call). **NO tag** (deploys are project-specific and out of scope).

Argument (optional): explicit file paths to include. If omitted, auto-scope to this session's feature files.

## Project config — resolve at runtime, never hardcode

Read the project's `CLAUDE.md` for a line of the form:

```
Jira: cloudId=<uuid> key=<KEY>
```

That line is the ONLY source for the project key. No line → the repo has no Jira wiring: skip every Jira step (steps 2 and 8's transition), ship the PR anyway, and say so in the report.

Resolve the Jira MCP dialect before any Jira call — see `references/jira-mcp.md`. It returns the tool names for this machine and whether `cloudId` is a parameter at all. Where it is required, the `cloudId=<uuid>` above supplies it; never guess one and never carry one over from another project — a wrong `cloudId` transitions some other project's ticket. Where the dialect has no `cloudId`, ignore that half of the line. No Atlassian MCP resolved → log the skip line from that file, ship the PR anyway, and report which transition was skipped.

Fallback when the line is absent but the user names a key, dialect A only: `mcp__atlassian__getAccessibleAtlassianResources` to resolve the cloudId. Still ambiguous → ask; do not pick one.

**Transition ids are per-project and change** — always list transitions with the resolved tool and match on `to.name`, never a hardcoded id. Same for the browse URL: derive it from the resolved site, not a literal host.

## Steps

0. **Read the pipeline receipt — gate the ship on it.** Find the ticket key (branch slug, the user's argument, or the Jira issue for this work) and read `tasks/receipts/<TICKET>.json`. The pipeline writes it; keys are `ticket`, `plan`, `sha` (HEAD at the last stage written — staleness detection), `red`/`green` (`cmd` + the REAL process `exit` + `at`), `review` (`critical`, `must_fix`, `warnings`, `unverified`, `warning_list` of `file:line what` strings), an optional `gating` block (`required`, `seeded`, `readback`), and `stage` (`red` | `green` | `reviewed` | `complete`). A receipt is a record, not a permission slip — never hand-write or edit one to get past this gate.

   | Receipt state | Do |
   |---|---|
   | file missing | **STOP** — no verified run. Offer `/implement` first. |
   | `stage != "complete"` | **STOP** — name the stage it died at |
   | `red.exit == 0` | **STOP** — tests never failed, so they prove nothing |
   | `green.exit != 0` | **STOP** — tests are red |
   | `review.critical > 0` · `review.must_fix > 0` (missing = 0) · `review.unverified > 0` | **STOP** — list them |
   | `gating` present, `readback != "ok"` or `seeded` misses a `required` key | **STOP** — the kill-switch does not exist; this feature could not be turned off after release |
   | `review.warnings > 0` | Print each warning (file:line + what it is) from `review.warning_list`, THEN **AskUserQuestion**: ship anyway / fix first. Never summarise as a bare count — an unread warning is the same as no warning. |
   | clean | proceed |

   **Staleness.** Compare `receipt.sha` to `git rev-parse HEAD`, and check `git status --short` for uncommitted changes to source files. The receipt describes the tree the pipeline verified; if code moved since, it describes nothing. Two legitimate cases:
   - HEAD == `receipt.sha`, source dirty → this is the normal case (the pipeline runs before the commit; step 5 commits exactly those edits). Proceed.
   - HEAD != `receipt.sha` → commits landed after the last verified run. **STOP** unless every commit since `receipt.sha` is non-source (docs, notes). Re-run the pipeline rather than reasoning about whether the drift was harmless.

   A STOP here is a real stop: report why and what to re-run, do not push. **Never write or edit a receipt to get past this gate** — if the gate is wrong, fix the gate. The user may override explicitly ("ship without the receipt"); record that they did in the report.

   No ticket key at all (a genuine chore/docs ship with no Jira issue) → skip this step; the receipt gate covers ticketed feature work.

1. **Inspect the tree.** Resolve `<default>` per `references/git-host.md`, then:
   ```bash
   git status --short && git branch --show-current && git fetch origin <default> -q && git rev-parse origin/<default> HEAD
   ```

2. **Confirm the Jira issue is In Progress.** The work being shipped should map to an issue in the project key from CLAUDE.md. If one exists and isn't already In Progress, move it there using the list-transitions and transition verbs **resolved in step 0** (never a hardcoded tool name) → match `to.name == "In Progress"`; if no issue exists for non-trivial feature work, flag it (offer to create one) but don't block the ship.

3. **Scope the commit.** Stage ONLY the session's feature files.
   - Leave UNSTAGED: anything not part of this feature — other-session WIP, generated or tool-output directories, personal notes, session/feedback files (unless the change IS docs), CI config.
   - NEVER stage sensitive files (`.env`, `serviceAccountKey.json`, `*cookies*`, keys/tokens) even on "commit everything" — offer gitignore instead.
   - If a touched file mixes the feature with unrelated hunks: split by logical concern — isolate via `git apply --cached` of a hand-built single-hunk patch (or `git add -p`), then commit from the index with a **bare** `git commit` (NO pathspec — `git commit <file>` leaks the full working tree).

4. **Pick the branch.**
   - If on `<default>`: branch first (PR-only; never push it).
   - If the work is a chore UNRELATED to the active feature branch, or HEAD is behind `origin/<default>`: base off `origin/<default>` for a clean PR — `git checkout -b <type>/<slug> origin/<default>` (working changes carry over).
   - Branch name: `feat/`, `fix/`, `chore/`, `docs/` + kebab slug.
   - **Jira link:** if the work maps to an issue, put the key in the branch slug: `feat/<KEY>-12-strong-bias-only`. Use the key the user gave, or one obvious from the work via the Atlassian MCP; if there's no issue, skip the key — don't invent one.

5. **Write the commit message — from what is STAGED, not from the plan alone.**
   Spawn the `changelog` agent, passing it the plan file path (`tasks/plans/<TICKET>_plan.md`) so the **Why** comes from the original intent rather than a restatement of the diff. Tell it to read `git diff --cached` (what is actually staged after step 3's scoping), NOT `git diff HEAD`.

   This is deliberately AFTER scoping: step 3 may split a file or drop hunks, so a message written earlier would describe changes that aren't in this commit. Regenerate it here every time — never reuse a message from an earlier pipeline run.

   No plan file (chore/docs ship) → write the message inline in the same format; the Why comes from the user's stated reason.

   Then commit. Conventional Commits, subject ≤50 chars, body explains the WHY. **Prefix the subject with the Jira key when one applies** so the GitHub-for-Jira app auto-links it: `<KEY>-12 feat(trading): strong bias only`.

   **No AI attribution in the commit message by default**: no `Co-Authored-By: Claude ...` trailer,
   no `🤖 Generated with Claude Code`, no `Claude-Session:` / `claude.ai/code` session link.
   Subject + body only, unless the project's `CLAUDE.md` asks for attribution trailers.

   Commit from the index with a bare `git commit -F -` (no pathspec).

6. **Verify scope before pushing.**
   ```bash
   git show --stat HEAD --oneline | head -20
   ```
   Confirm only intended files. If a partial-file commit, `git show HEAD -- <file>` and grep for excluded changes.

7. **Push + open PR.**
   ```bash
   git push -u origin <branch>
   gh pr create --base <default> --title "<conventional title>" --body "<what / why / safety>"
   ```
   - Not GitHub, or `gh` unusable (`references/git-host.md` probe) → push, then that file's manual path; the report gives the compare/MR URL plus the title/body to paste.
   - **Jira:** include the `<KEY>-NN` key in the PR title (e.g. `<KEY>-12 feat(trading): strong bias only`) when the work maps to an issue, so the GitHub-for-Jira app links the PR to the issue.
   **PR body = what / why / safety + the Jira link. Nothing else.**
   - **what** — the change, from the staged diff (same content as the commit subject/body, step 5).
   - **why** — the reason it was made; from the plan file's intent, or the user's stated reason.
   - **safety** — how it was verified and what the blast radius is: the receipt verdict from
     step 0 (tests green on attempt N, review clean / N warnings shipped anyway), plus anything
     a reviewer needs to judge risk — behind a toggle defaulting off, schema/migration change and
     whether it reverts cleanly, pre-existing failures confirmed unrelated. If there is nothing
     to say beyond the receipt, one line is the whole section — do not pad it.

   No other sections. No AI attribution by default — no `🤖 Generated with Claude Code`, no
   `claude.ai/code` session link, no `Co-Authored-By: Claude` trailer — in the PR body AND in the
   commit message (see step 5).
   **Jira ref = clickable link:** end the body with
   `Jira: [<KEY-N>](<site-url>/browse/<KEY-N>)` — key in the title for the GitHub-for-Jira
   app, link in the body for humans. Derive `<site-url>` from the resolved site.

8. **Report** the PR URL, plus the receipt verdict from step 0 (tests green on attempt N, review clean / N warnings shipped-anyway / receipt gate overridden). STOP — do not merge. If the work has an issue and the Atlassian MCP is authenticated, move it to **In Review** (resolved *list transitions* tool → the transition whose `to.name == "In Review"` → resolved *transition* tool). Transition ids differ per project — match on name, never hardcode an id. No `In Review` transition in this project's workflow → log it and move on.

   The move past In Review happens at MERGE time, not here — `/ship` only opens the PR. Run
   `/tdd-pipeline:merged` after the PR is merged: it verifies the merge, moves the ticket to the
   board's verification column (or Done on boards without one), and cleans up the branch.
   `/tdd-pipeline:validated` then records your sign-off and closes it. Do NOT rely on the native
   GitHub-for-Jira "PR merged → Done" rule (unreliable).

## "add <file>" variant
If the user later says "add X and commit it" while a PR is open, that means a NEW COMMIT on the CURRENT open PR branch — do not open a second PR.

## Gotchas
- `stage` in a receipt encodes how far VERIFICATION got, not whether a commit exists — Stage 5's own output is "Pipeline complete. Nothing committed." A pipeline that fixed review warnings and re-ran suite/compile/review may still be sitting at `"reviewed"`; that is a stale label, not an incomplete run.
- When the gate stops on a receipt field, resume the agent and ask whether the field is TRUE — never tell it which value to write. Instructing the value turns receipt regeneration into laundering. Instruct it to refuse and name the gap if some stage genuinely did not finish.
- Verify a push landed by comparing `git rev-parse origin/<branch>` to local HEAD. `PIPESTATUS` can come back empty through a shell wrapper, so a push's exit code may be unreadable while the output text still looks successful.
- Scan for AI attribution in the actual commit object (`git log -1 --format=%B`) and the live PR body fetched back from `gh`, not only in the source file you wrote — and run a positive control so an empty grep means absence, not a broken command.
- A changelog agent's subject line can exceed the ≤50-char limit; measure it before committing (`head -1 | wc -c` counts the newline, so subtract 1).
- Fixing a warning at the ship gate INVALIDATES the receipt's green — the suite that passed described a different tree. Re-run the full suite plus any cross-platform compile after the fixes and before committing, and read the counts from result XML. A "cosmetic" warning fix can be functional: wrapping a call in `withContext(realDispatcher)` inside code under `runTest` parks the coroutine forever because virtual time cannot advance a real dispatcher.
- When a warning cannot be fixed as scoped, say so and file it rather than shipping a fix that looks applied. Re-verify the revert too — a reverted fix leaves stale imports that only a compile catches.
- Stage feature files by explicit path; `git add -A` sweeps generated caches and other tickets' plans/receipts into the commit. Verify with `git diff --cached --name-only` before writing the message, and re-check after any late fix.
- Before reading ANY suite verdict at the gate, delete the test-results directory and pass `--rerun-tasks`. Stale XML from a previous run reports the old pass counts while the build exits non-zero — a failed build that looks green.
- Before ANY git command at the gate, confirm the shell's cwd is the target repo — a persisted cd from an earlier freshness-check in another checkout makes `git status`/`rev-parse` answer for the WRONG repo, and the output looks plausible. Verify by matching HEAD against the receipt's sha, not by eyeballing paths.
- A receipt saying `complete` covers what was BUILT, not what was PLANNED — before staging, reconcile the plan's Files to Create/Modify list against `git status`; a pipeline can reach 0/0 on two-thirds of a plan (UI half and docs items were once entirely absent while the receipt read complete).
- Build a multi-line commit message from a FILE (`git commit -F <file>`). Chaining `--amend` to fix a subject can collapse the entire body into the subject line; verify with `git log -1 --format=%s` after any amend.
- Never quote a remembered test baseline ("3 known failures") — re-derive it from the run you just did. A stale baseline makes a green suite look broken and a broken one look expected.
- Count symbol occurrences with `grep -o <sym> | wc -l`, never `grep -c` — `grep -c` counts matching LINES, so a line with several matches under-reports and reads as a missing change.
- When the staged diff touches a JS/CSS asset served with a cache-buster query string, the version bump belongs in THAT SAME commit; shipping the asset alone leaves cached browsers on old code and the feature invisible after a green deploy.
- A crash found while probing at the ship gate is NOT automatically pre-existing — check it against the stashed/pre-change tree before dismissing it. A rewrite that swaps a fail-soft helper (one catching TypeError/ValueError) for a raw `float()`/cast silently drops that contract at every call site, and if the caller swallows exceptions the feature then fails INVISIBLY in production.
- When a warning fix touches a function whose tests STUB the collaborators it calls, those tests cannot see the change — fault-inject the refactor itself (break the refactored line, confirm RED) before trusting green. A refactor can pass a full suite while altering behaviour no test observes.
- The never-edit-a-receipt rule covers ADDITIVE edits too, not just gate fields. Appending a `post_review_fixes`/`verified` block feels harmless because no gate value changes — but the receipt then records work the pipeline did not perform, and the author is the one grading whether their own edit was harmless. Let it stay stale and put the post-review work in the PR body and the report instead.
- A negative control EXPIRES when the assertion path it exercises changes. Fixing a review warning that touches the assertion (a `!!` → `?: fail`, a widened regex, a changed comparison shape) invalidates the prior control's verdict even though the production change is untouched — re-run it and read the new failure text, never reuse the earlier PASS.
- Verify-red (test fails before implementation exists) is NOT a post-implementation negative control (test fails when the asserted value is degraded with implementation in place). They prove different things; a receipt carrying only the former has not established the test discriminates.
- Android runs every unit-test class under BOTH debug and release variants, so summing all `TEST-*.xml` double-counts. Read one variant (`testDebugUnitTest`) or the repo-wide figure silently doubles — 65 real tests reported as 130.
- A MISSING receipt usually means the pipeline was never run, not that it failed — the fix is to write the plan file and run the pipeline, never to reconstruct a receipt from an inline build. Self-written tests authored after a self-written implementation cannot produce a legitimate `red` exit, so there is nothing to salvage; revert to a clean base and rebuild.
- A receipt that is STALE-PESSIMISTIC still blocks: it may record Criticals or warnings already fixed, or a test count from a superseded tree. Regenerate it by re-running the pipeline — never edit it, even when the recorded Critical is one you demonstrably fixed. Re-running has twice surfaced a NEW Critical in code that a prior review had called clean.
- When the pipeline DIED before writing a receipt at all, there is no agent to resume and no field to ask about — run the missing stage yourself, write the receipt from what it actually returned, and DISCLOSE in the ship report that the receipt was hand-written. Silently hand-writing one passes the gate while emptying it of meaning; refusing to ship at all strands finished, verified work.
- Fixing a warning at the gate INVALIDATES the receipt that described the old tree. Regenerating that receipt by RE-RUNNING the verification and reading the real output is legitimate; hand-editing a field to clear the gate is laundering. Say which one is happening before doing it, and instruct any agent you delegate the re-run to that it must REFUSE to write a clean receipt if a check does not actually pass.
- A warning-gate answer may arrive as neither option ("Fix all first") — read it by intent, fix before committing, and re-run the FULL suite, because fixing invalidates the receipt's green.
- Verify a pushed commit is an ANCESTOR of the default branch (`git merge-base --is-ancestor`), not merely that the PR reports MERGED — a merge can land while a second push to the same branch is still in flight, carrying only the first commit.
- The changelog agent may write per-file bullets from the plan's file list, not the hunks — and say so only in its verified/inferred note. Check each bullet against `git diff --cached` before committing.
- Never chain `git commit` after a message-editing step with `;` — a failed edit (assert, sed no-match) still commits the STALE message. Use `&&` or a separate call, then read `git log -1 --format=%B` back before pushing.
- Each warning-fix round can introduce a NEW warning worse than the one it cleared (an async "non-blocking" refresh added a hung-thread freeze to clear a Low read-on-thread note). At the gate, compare every new warning's severity to the one it replaced and recommend REVERTING a fix that traded down.
