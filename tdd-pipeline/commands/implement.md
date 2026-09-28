Spawn the build-coordinator agent to execute the full TDD pipeline against an approved plan.

Plan path: $ARGUMENTS

Precondition: an approved plan file must exist at `tasks/plans/<TICKET>_plan.md`.
- If a path is given in $ARGUMENTS, use it.
- If none is given, default to the most recently modified `tasks/plans/*_plan.md`.
- If no such file exists → STOP and tell the user to run this plugin's `build` command first and approve a plan.
- State which plan file you resolved; if the user named a ticket and the resolved file doesn't match it, STOP and ask.

### Approval gate (runs only if `~/projects/agent-office/tools/gate.py` exists; otherwise skip silently — behaviour unchanged)
A plan FILE is not an approval. Check the durable record for this exact version of the file:
run `python3 ~/projects/agent-office/tools/gate.py check <resolved-plan-path>` and act on stdout:
- `approve` → proceed.
- `discard` → STOP: this plan was discarded; name the recorded timestamp. Never build a
  discarded plan, whatever its mtime says.
- `revise` → STOP: a revision was requested and the plan has not been rewritten since.
  Tell the user to finish the revise (the rewrite reopens the gate).
- `unanswered` → no recorded approval for this version. If `$AGENT_OFFICE_GATE` is `floor`,
  run `python3 ~/projects/agent-office/tools/gate.py wait <resolved-plan-path> --timeout 600`
  and act on its outcome as above (`timeout` → ask below). Otherwise ask via
  `AskUserQuestion` ("Build this plan?" — Approve / Cancel); on Approve run
  `python3 ~/projects/agent-office/tools/gate.py record <resolved-plan-path> approve`
  so the answer is durable, on Cancel record `discard` and STOP. This closes the hole
  where the newest plan file gets built with nobody on record approving it.

### Step 0 — Move Jira ticket to "In Progress" (if a ticket is in scope)
Before spawning the build-coordinator, derive the Jira ticket key from the resolved
plan file (e.g. `<KEY>` from `tasks/plans/<KEY>_plan.md`).
- If a key is present, resolve the Jira MCP dialect FIRST — see
  `references/jira-mcp.md`. It returns the tool names to use and whether `cloudId` is a
  parameter on this machine. No Atlassian MCP resolved → log the skip line from that file
  and proceed to the build; the pipeline does not depend on Jira.
- Look up the ticket's available transitions with the resolved *list transitions* tool.
- Find the transition whose `to.name` is exactly `"In Progress"` (a Jira convention,
  not a per-project id). If no such transition exists, log a one-line note
  ("<KEY>: no 'In Progress' transition in this project's workflow — skipping")
  and proceed. Do not break the pipeline on Jira weirdness.
- Apply it with the resolved *transition* tool, passing that id.
- On a 400, read the error body: "transition not available/valid from the current
  status" means the ticket is already in or past In Progress — log the no-op and
  proceed. Any OTHER error (auth, permissions, project misconfig) → log a one-line
  warning with the error text and proceed. The pipeline must not depend on Jira
  being available.
- If no ticket key can be derived from the plan filename, skip this step silently.
- Log what you did, e.g. "📋 Moved <KEY> → In Progress" or
  "📋 <KEY> already past In Progress, no transition needed".

Pass the resolved plan path to the build-coordinator agent. The coordinator will run these
stages in sequence, reading the plan file at that path:
1. test-writer — writes failing tests from the plan
2. implementer — writes implementation to make tests pass
3. test-runner — runs tests, fixes failures (max 5 attempts)
4. code-review-coordinator — reviews the diff
5. STOP at the ship gate — /ship writes the commit message from the staged diff

If tests fail after 5 attempts, the pipeline stops and reports what went wrong.

## Gotchas
- Never read the build-coordinator's REPORT as the run's outcome — verify from disk. One returned the literal string `placeholder` after 199k tokens and 309 tool calls, while the files, the test file and a receipt were all on disk and the receipt showed it had stopped at `stage:green` with the review stage never run. Check `tasks/receipts/<TICKET>.json`'s `stage` field and the created files before reporting anything; an empty hand-back is evidence about the hand-back, not about the work.
