Spawn the build-coordinator agent to execute the full TDD pipeline against an approved plan.

Plan path: $ARGUMENTS

Precondition: an approved plan file must exist at `tasks/plans/<TICKET>_plan.md`.
- If a path is given in $ARGUMENTS, use it.
- If none is given, default to the most recently modified `tasks/plans/*_plan.md`.
- If no such file exists → STOP and tell the user to run this plugin's `build` command first and approve a plan.
- State which plan file you resolved; if the user named a ticket and the resolved file doesn't match it, STOP and ask.

### Approval gate (optional hook — only if `$PLAN_GATE_CMD` is set; otherwise skip silently)
A plan FILE is not an approval. Run `eval "$PLAN_GATE_CMD" check <resolved-plan-path>` (prints
approve/revise/discard/unanswered for this exact file version): `approve` → proceed; `discard`
→ STOP, never build a discarded plan; `revise` → STOP until the plan is rewritten; `unanswered`
→ ask via `AskUserQuestion` ("Build this plan?" — Approve / Cancel) and run
`eval "$PLAN_GATE_CMD" record <resolved-plan-path> approve|discard` (Cancel → `discard` and STOP).

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
0. resolve `TEST_CMD` once for any stack (CLAUDE.md `Test:` line → CI config → build files)
1. test-writer — writes failing tests from the plan
2. implementer — writes implementation to make tests pass
3. test-runner → implementer (fix) → test-runner, max 5 fix rounds
4. code-review-coordinator — reviews the diff
5. finalize the receipt and hand back

If tests still fail after 5 fix rounds, or the failure is environmental, the pipeline stops
and reports what went wrong.

### Auto-ship
When the coordinator returns, read `tasks/receipts/<TICKET>.json` from disk (see Gotchas).
- `stage == "complete"` → run this plugin's `ship` command now (Skill tool,
  `tdd-pipeline:ship`), with no extra confirmation. Its receipt gate still stops on red
  tests, stale sha, or any Critical / Must-fix, and still asks before shipping with warnings.
- Anything else → report the stage it stopped at and do NOT ship.

## Gotchas
- Never read the build-coordinator's REPORT as the run's outcome — verify from disk. One returned the literal string `placeholder` after 199k tokens and 309 tool calls, while the files, the test file and a receipt were all on disk and the receipt showed it had stopped at `stage:green` with the review stage never run. Check `tasks/receipts/<TICKET>.json`'s `stage` field and the created files before reporting anything; an empty hand-back is evidence about the hand-back, not about the work.
