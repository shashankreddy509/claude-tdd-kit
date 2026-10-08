Post-merge cleanup: confirm the PR actually merged, move the Jira ticket to the project's
post-review state, sync the default branch, and delete the merged feature branch.

This is Stage 4 of the gated pipeline (Build → Implement → Ship → **Merged** → Validated).
Run it after you've reviewed and merged the PR that `/tdd-pipeline:ship` opened.

Triggers: `/tdd-pipeline:merged [<KEY>|<PR#>]`, e.g. `/tdd-pipeline:merged PROJ-12`.

Argument (optional): the ticket key or PR number. If omitted, derive from the most recently
modified `tasks/plans/*_plan.md`, or from the current branch (`feat/PROJ-12-slug` → `PROJ-12`).

**Never merges** — it runs after a merge you performed, and refuses if the PR isn't merged.
**Never deploys** — deploy paths are project-specific (tags, pipelines, hosts).
**Never moves a ticket to Done when the board has a verification column** — see Step 2.

---

### Step 0 — Resolve context

- Determine `<KEY>` from the argument, the newest plan file, or the branch name. With no key,
  the git cleanup still runs and every Jira step is skipped.
- Resolve the Jira MCP dialect ONCE — see `references/jira-mcp.md`. It returns the tool names
  for this machine and whether `cloudId` is a parameter (and if so, where to read it from).
  No Atlassian MCP resolved → log the skip line from that file, run the git cleanup, and skip
  every Jira step below.
- Determine `<default>` per `references/git-host.md` — do NOT assume `main`.

### Step 1 — Verify the merge actually happened

Don't trust the caller, and don't treat "closed" as "merged" — a closed-unmerged PR must
never close a ticket or delete a branch.

GitHub path:
```bash
gh pr view <#|branch> --json number,url,state,mergedAt,mergeCommit,headRefName
```

Falling back to a search when only a key is known:
```bash
gh pr list --search "<KEY>" --state merged --json number,url,mergedAt,mergeCommit,headRefName --limit 5
```

Manual path → `references/git-host.md` merge confirmation; "Not yet" = `OPEN` → stop;
`headRefName` = the branch you pushed.

- `MERGED` → continue; capture PR URL, merge commit, merged-at, and `headRefName` (the branch
  to delete later — take it from here, never guess).
- `CLOSED` (not merged) → **stop**. Report it; touch nothing.
- `OPEN` → **stop**. Tell the user to merge first.

### Step 2 — Pick the post-review state (discovery, two-stage)

Call the resolved *list transitions* tool for `<KEY>`.

Workflows differ between projects on the same site — one board may expose four transitions,
another six, with different status ids behind identical names. **Discover; never hardcode.**

Choose in this order:

1. A **verification column** — `to.name` of "Build Testing", "QA", "Testing", or "Verify".
   Prefer this when it exists. A merged PR is not a validated one: the ticket parks here, the
   user validates on a real build, and `/tdd-pipeline:validated` closes it afterwards.
   **Do not move to Done in this case**, even though a Done transition is available.
2. Otherwise **Done** (`to.name == "Done"`, or `to.statusCategory.key == "done"`). With no
   verification column there is nothing to gate on, so closing here is correct.
3. Otherwise **ask** via `AskUserQuestion`, listing the available transitions plus a
   "leave it as-is" option. Never invent a destination.

Say which you picked and why, in one line:
"Board has Build Testing → parking there; run /tdd-pipeline:validated after you verify."

Apply it with the resolved *transition* tool, passing the discovered id.

A 400 saying the transition isn't valid from the current status means it's already there or
beyond — log the no-op, don't retry with another id. Any other error is a one-line warning;
the merge is the real event and ticket state is bookkeeping.

### Step 3 — Comment the merge record

Plain text only — the MCP's markdown→ADF conversion leaks literal `**` and renders tables
unreliably. No tables, no bold, no fenced blocks.

```
Merged: <PR url>
Merge commit: <short-sha>
Merged at: <timestamp>
Moved to: <status name>
```

Post it with the resolved *comment* tool. The body parameter's name differs by dialect
(`commentBody` / `body`) — take it from the schema.

A failed comment is a one-line warning, not a stop.

### Step 4 — Sync the default branch

**Stop if the working tree is dirty** — surface it and let the user decide rather than
switching branches over uncommitted work.

```bash
git status --porcelain    # must be empty before continuing
git checkout <default> && git fetch origin <default> -q && git pull --ff-only origin <default>
```

`--ff-only` deliberately: never create a merge commit on the default branch here.

### Step 5 — Delete the merged branch (ask first)

Use `headRefName` from Step 1, never the branch you happen to be on.

```bash
git branch -d <headRefName>             # -d, never -D: refuses if not merged
git push origin --delete <headRefName>  # only if it still exists remotely
```

Ask before the remote delete. `-d` failing is a real signal — it means git doesn't consider
the branch merged, so investigate rather than reaching for `-D`. (Squash merges legitimately
trigger this; confirm the squash commit contains the work before forcing anything.)

### Step 6 — Report

```
✅ <KEY> merged via <PR url>
✅ Moved to "<status>"
✅ <default> synced · <branch> deleted
```

When the ticket parked in a verification column, close with what still has to happen:
"Validate on a real build, then run `/tdd-pipeline:validated <KEY>` to close it. If it fails,
file a bug linked to this ticket instead."

If the project has its own deploy ritual, mention that deploying is separate. **Do not run it.**

---

## Notes

- The two-stage close (verification column → validated) exists so "Done" means *validated*,
  not merely *merged*. On boards without such a column the distinction can't be expressed,
  so Done is correct there.
- Verifies the merge from the GitHub API (or your confirmation on other hosts) rather than
  trusting the caller.
- Nothing hardcoded: no cloudId, site, key, transition id, status-name mapping, or default
  branch name. Two projects on the same site do differ.
- Idempotent: re-running logs no-ops rather than erroring.
- Deliberately does not deploy.

## Examples

```
/tdd-pipeline:merged PROJ-12
# → verifies PROJ-12's PR merged
# → board has Build Testing → parks there (not Done), comments the record
# → syncs the default branch, asks before deleting the branch

/tdd-pipeline:merged
# → derives the key from the newest plan file or the branch name
```

## Gotchas
- Rule 2's "no verification column → Done" is a DEFAULT, not a mandate. When the ticket's central claim is asserted-not-verified (no device run, no instrumented proof), hold it at In Review and write the exact repro into Jira. Done must mean validated, and a board that cannot express that is a reason to hold, not a licence to close.
- `git branch --merged` omits squash-merged branches, so its silence is not evidence the work is unmerged. Prove containment with an empty `git diff origin/<default> <branch>` plus a one-parent merge commit BEFORE reaching for `-D`.
- `git pull --ff-only` can print "Updating a..b" and still leave HEAD where it was. Verify the sync by comparing `git rev-parse <default>` to `git rev-parse origin/<default>`, and confirm the merge commit is an ancestor.
- Content-verify the merge on the default branch by grepping for the actual new SYMBOLS, never the commit subject — with a positive control (known-present symbol) and a negative control (symbol that must not exist) proving the grep discriminates.
- Step 4's "stop if the working tree is dirty" is about protecting UNRELATED work, not a blanket halt. When the dirt is the user's pre-existing WIP, prove disjointness first (`comm -12` the dirty paths against `git diff --name-only origin/<default>...HEAD`); zero overlap means the checkout is safe and the sync proceeds. Blindly stopping every session on standing WIP is as wrong as blindly switching.
- On a board where Done means DEPLOYED TO PRODUCTION, a merge plus a dev/staging deploy does not earn it — check what the deployed artifact actually is (running tag, a served cache-buster or version string) before transitioning, and park in the verification column when only a pre-release is out. A ticket belonging to an epic that ships in ONE tag stays parked until that tag exists, however complete its own code is.
- With no argument and MORE THAN ONE PR outstanding, do not assume the newest is the merged one — query every open PR's state and act only on those reading MERGED. A PR still OPEN must leave its branch, its todo, and its ticket untouched, and the report must say which was skipped and why.
- Never use `wc -l` for the content-verification greps: `git grep -l` on no match prints nothing and `wc -l` reports 1, so a NEGATIVE control reads as PRESENT and a positive one as found — the check silently inverts. Use `grep -q` / `git grep -q` and branch on the exit status.
- A negative control tripping is not proof of a regression — locate every hit before concluding. A removed symbol legitimately survives in the KDoc explaining its removal, and in the receipt; only a hit in live code or config counts.
- Extend the content-verification sweep to DOCS, not just code symbols: grep `*.example`, README, and setup files for the OLD value of any constant the merged work changed. A code fix that lands while the file telling people how to configure it keeps the pre-fix value points every new setup at the broken setting.
- An empty `git diff origin/<default> <branch>` proves containment only when the branch is not merely BEHIND the default; a branch cut before a later merge shows a non-empty diff of OTHER people's commits and is still safe to delete. Prove containment by grepping the branch's own new symbols on the default branch, not by the diff's emptiness alone.
- Restarting a service to pick up merged `src/` changes proves nothing on its own: compare the process START TIME to the COMMIT time (`lsof -ti :<port>` then `ps -p <pid> -o lstart=` against `git log -1 --format=%ci`). A new pid is not a new codebase — a restart fired before the commit landed, or one that died on "Address already in use" while an older process kept the port, both look like success and report a fix as live when it is not running.
- A NON-EMPTY `git diff origin/<default> <branch>` on a merged branch is usually the default branch being AHEAD, not missing work — the gotcha above reads an empty diff as the containment proof, so a non-empty one wrongly looks like a blocker. Settle it with `git rev-list --count origin/<default>..<branch>`: 0 means fully contained and `-d` is safe, however many files the diff lists.
- Syncing the default branch on a dirty tree does NOT require a checkout: `git fetch origin <default>:<default>` fast-forwards the local ref in place, leaving the working tree and the current branch untouched. Reach for it whenever `git status --porcelain` is non-empty — it sidesteps both the aborted checkout and the stash entirely. Guard it with `git merge-base --is-ancestor <default> origin/<default>` first; a non-ancestor means local commits exist and the fetch must not be forced.
- Proving the dirty paths are disjoint from the PR's files is NOT sufficient to make `git checkout <default>` safe, and neither is an empty `git diff HEAD origin/<default> -- <file>`: both compare COMMITTED trees, while the checkout is blocked by the WORKING TREE copy. A file carrying unrelated uncommitted hunks aborts the switch with "Please commit your changes or stash them" even when its committed content is identical on both branches. Sync via the fetch-into-ref form above instead of reasoning about whether the switch will be allowed.
- `git pull --ff-only origin <default>` run while still ON the feature branch tries to fast-forward THAT branch, not the default one, and fails with "Not possible to fast-forward" — which reads as a merge problem rather than a wrong-branch mistake. Echo `git branch --show-current` immediately before any pull, or use the fetch-into-ref form which is branch-independent.
- A ticket transitioned to Done while seeding a board is NOT evidence it merged — backfilled status reflects what someone believed, not a merge. On arrival, re-derive each ticket's state from the PR and the default branch before commenting a merge record against it, and say plainly when a status predated the PR.
- A board with no `In Review` transition is normal, not an error — e.g. a workflow with only Backlog / To Do / In Progress / Done / Build Testing. Log the absence and move on; do NOT invent a destination or leave the ticket silently mid-flight, and say in the report which transition was skipped.
- Jira attributes every MCP write to the account that owns the token, so a changelog `author` can NEVER distinguish your transition from the user's or another session's. Read the TIMESTAMPS against your own actions instead, and treat repeated write timeouts plus a same-status no-op row as the signature of two sessions racing on one ticket.
- Discover the post-review state BEFORE transitioning anywhere at ship time — moving a ticket to Done earlier in the session, then finding the board has a verification column, means walking a close back. Check for Build Testing/QA once, at the first transition.
