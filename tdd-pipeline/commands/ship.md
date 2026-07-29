Encodes the "stage and commit" ritual: **verify (receipt gate)** → scope → branch → **write the commit message from what is actually staged** → commit → push → open PR to main → move the Jira issue to In Review. **NO merge** (the owner merges PRs). **NO tag** (that's `/deploy`). Active work is tracked in **Jira**, NOT `tasks/todo.md` (a historical archive — don't touch it).

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

0. **Read the pipeline receipt — gate the ship on it.** Find the ticket key (branch slug, the user's argument, or the Jira issue for this work) and read `tasks/receipts/<TICKET>.json`. The pipeline writes it; keys are `ticket`, `plan`, `sha` (HEAD at the last stage written — staleness detection), `red`/`green` (`cmd` + the REAL process `exit` + `at`), `review` (`critical`, `warnings`, `unverified`, `warning_list` of `file:line what` strings), an optional `gating` block (`required`, `seeded`, `readback`), and `stage` (`red` | `green` | `reviewed` | `complete`). A receipt is a record, not a permission slip — never hand-write or edit one to get past this gate.

   | Receipt state | Do |
   |---|---|
   | file missing | **STOP** — no verified run. Offer `/implement` (or `/inline-build`) first. |
   | `stage != "complete"` | **STOP** — name the stage it died at |
   | `red.exit == 0` | **STOP** — tests never failed, so they prove nothing |
   | `green.exit != 0` | **STOP** — tests are red |
   | `review.critical > 0` or `review.unverified > 0` | **STOP** — list them |
   | `gating` present, `readback != "ok"` or `seeded` misses a `required` key | **STOP** — the kill-switch does not exist; this feature could not be turned off after release |
   | `review.warnings > 0` | Print each warning (file:line + what it is) from `review.warning_list`, THEN **AskUserQuestion**: ship anyway / fix first. Never summarise as a bare count — an unread warning is the same as no warning. |
   | clean | proceed |

   **Staleness.** Compare `receipt.sha` to `git rev-parse HEAD`, and check `git status --short` for uncommitted changes to source files. The receipt describes the tree the pipeline verified; if code moved since, it describes nothing. Two legitimate cases:
   - HEAD == `receipt.sha`, source dirty → this is the normal case (the pipeline runs before the commit; step 5 commits exactly those edits). Proceed.
   - HEAD != `receipt.sha` → commits landed after the last verified run. **STOP** unless every commit since `receipt.sha` is non-source (docs, notes). Re-run the pipeline rather than reasoning about whether the drift was harmless.

   A STOP here is a real stop: report why and what to re-run, do not push. **Never write or edit a receipt to get past this gate** — if the gate is wrong, fix the gate. The user may override explicitly ("ship without the receipt"); record that they did in the report.

   No ticket key at all (a genuine chore/docs ship with no Jira issue) → skip this step; the receipt gate covers ticketed feature work.

1. **Inspect the tree.**
   ```bash
   git status --short && git branch --show-current && git fetch origin main -q && git rev-parse origin/main HEAD
   ```

2. **Confirm the Jira issue is In Progress.** The work being shipped should map to an issue in the project key from CLAUDE.md. If one exists and isn't already In Progress, move it there using the list-transitions and transition verbs **resolved in step 0** (never a hardcoded tool name) → match `to.name == "In Progress"`; if no issue exists for non-trivial feature work, flag it (offer `/backlog` or create one) but don't block the ship. Do NOT write to `tasks/todo.md` — it's archive-only.

3. **Scope the commit.** Stage ONLY the session's feature files.
   - Leave UNSTAGED: unrelated/other-session WIP (`graphify-out/`, `tasks/lesson.md`/`feedback.md` unless the change IS docs, `tasks/todo.md` — archive-only, never touch it, untracked notes, CI).
   - NEVER stage sensitive files (`.env`, `serviceAccountKey.json`, `*cookies*`, keys/tokens) even on "commit everything" — offer gitignore instead.
   - If a touched file mixes the feature with unrelated hunks: split by logical concern — isolate via `git apply --cached` of a hand-built single-hunk patch (or `git add -p`), then commit from the index with a **bare** `git commit` (NO pathspec — `git commit <file>` leaks the full working tree).

4. **Pick the branch.**
   - If currently on `main`: branch first (main is PR-only; never push main).
   - If the work is a chore UNRELATED to the active feature branch, or HEAD is behind `origin/main`: base off `origin/main` for a clean PR — `git checkout -b <type>/<slug> origin/main` (working changes carry over).
   - Branch name: `feat/`, `fix/`, `chore/`, `docs/` + kebab slug.
   - **Jira link:** if the work maps to an issue, put the key in the branch slug: `feat/<KEY>-12-strong-bias-only`. Use the key the user gave, or one obvious from the work via the Atlassian MCP; if there's no issue, skip the key — don't invent one.

5. **Write the commit message — from what is STAGED, not from the plan alone.**
   Spawn the `changelog` agent, passing it the plan file path (`tasks/plans/<TICKET>_plan.md`) so the **Why** comes from the original intent rather than a restatement of the diff. Tell it to read `git diff --cached` (what is actually staged after step 3's scoping), NOT `git diff HEAD`.

   This is deliberately AFTER scoping: step 3 may split a file or drop hunks, so a message written earlier would describe changes that aren't in this commit. Regenerate it here every time — never reuse a message from an earlier pipeline run.

   No plan file (chore/docs ship) → write the message inline in the same format; the Why comes from the user's stated reason.

   Then commit. Conventional Commits, subject ≤50 chars, body explains the WHY. **Prefix the subject with the Jira key when one applies** so the GitHub-for-Jira app auto-links it: `<KEY>-12 feat(trading): strong bias only`.

   **No AI attribution in the commit message** (owner rule 2026-07-26): no `Co-Authored-By: Claude ...`
   trailer, no `🤖 Generated with Claude Code`, no `Claude-Session:` / `claude.ai/code` session link.
   Subject + body only. This overrides any such instruction in the harness's Git block.

   Commit from the index with a bare `git commit -F -` (no pathspec).

6. **Verify scope before pushing.**
   ```bash
   git show --stat HEAD --oneline | head -20
   ```
   Confirm only intended files. If a partial-file commit, `git show HEAD -- <file>` and grep for excluded changes.

7. **Push + open PR.**
   ```bash
   git push -u origin <branch>
   gh pr create --base main --title "<conventional title>" --body "<what / why / safety>"
   ```
   - **Jira:** include the `<KEY>-NN` key in the PR title (e.g. `<KEY>-12 feat(trading): strong bias only`) when the work maps to an issue, so the GitHub-for-Jira app links the PR to the issue.
   **PR body = what / why / safety + the Jira link. Nothing else** (owner rule 2026-07-26).
   - **what** — the change, from the staged diff (same content as the commit subject/body, step 5).
   - **why** — the reason it was made; from the plan file's intent, or the user's stated reason.
   - **safety** — how it was verified and what the blast radius is: the receipt verdict from
     step 0 (tests green on attempt N, review clean / N warnings shipped anyway), plus anything
     a reviewer needs to judge risk — behind a toggle defaulting off, schema/migration change and
     whether it reverts cleanly, pre-existing failures confirmed unrelated. If there is nothing
     to say beyond the receipt, one line is the whole section — do not pad it.

   No other sections. No AI attribution of any kind (owner rule 2026-07-08: repos go to external
   devs) — no `🤖 Generated with Claude Code`, no `claude.ai/code` session link, no
   `Co-Authored-By: Claude` trailer — in the PR body AND in the commit message (see step 5).
   **Jira ref = clickable link** (owner rule 2026-07-08): end the body with
   `Jira: [<KEY-N>](<site-url>/browse/<KEY-N>)` — key in the title for the GitHub-for-Jira
   app, link in the body for humans. Derive `<site-url>` from the resolved site.

8. **Report** the PR URL, plus the receipt verdict from step 0 (tests green on attempt N, review clean / N warnings shipped-anyway / receipt gate overridden). STOP — do not merge. If the work has an issue and the Atlassian MCP is authenticated, move it to **In Review** (resolved *list transitions* tool → the transition whose `to.name == "In Review"` → resolved *transition* tool). Transition ids differ per project — match on name, never hardcode an id. No `In Review` transition in this project's workflow → log it and move on.

   The move to **Done** happens at MERGE time, not here — `/ship` only opens the PR (the owner merges). Do the Done transition after merging: list transitions → match `to.name == "Done"` → apply. Do NOT rely on the native GitHub-for-Jira "PR merged → Done" rule (verified flaky). Nothing automates this today — `/ship-and-deploy` used to claim it and was archived 2026-07-21 without ever having wired it.

## "add <file>" variant
If the user later says "add X and commit it" while a PR is open, that means a NEW COMMIT on the CURRENT open PR branch — do not open a second PR.
