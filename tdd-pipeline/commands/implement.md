Spawn the build-coordinator agent to execute the full TDD pipeline against an approved plan.

Plan path: $ARGUMENTS

Precondition: an approved plan file must exist at `tasks/plans/<TICKET>_plan.md`.
- If a path is given in $ARGUMENTS, use it.
- If none is given, default to the most recently modified `tasks/plans/*_plan.md`.
- If no such file exists → STOP and tell the user to run this plugin's `build` command first and approve a plan.
- State which plan file you resolved; if the user named a ticket and the resolved file doesn't match it, STOP and ask.

### Step 0 — Move Jira ticket to "In Progress" (if a ticket is in scope)
Before spawning the build-coordinator, derive the Jira ticket key from the resolved
plan file (e.g. `<KEY>` from `tasks/plans/<KEY>_plan.md`).
- If a key is present, resolve `cloudId` first: prefer a `Jira: cloudId=<uuid> key=<KEY>`
  line in the project's CLAUDE.md; otherwise call
  `mcp__atlassian__getAccessibleAtlassianResources` and use the returned site's id.
  Never hardcode a cloudId in the plugin.
- Look up the ticket's available transitions via
  `mcp__atlassian__getTransitionsForJiraIssue(cloudId=<cloudId>, issueIdOrKey=<key>)`.
- Find the transition whose `to.name` is exactly `"In Progress"` (a Jira convention,
  not a per-project id). If no such transition exists, log a one-line note
  ("<KEY>: no 'In Progress' transition in this project's workflow — skipping")
  and proceed. Do not break the pipeline on Jira weirdness.
- Call `mcp__atlassian__transitionJiraIssue(cloudId=<cloudId>, issueIdOrKey=<key>, transition={"id": <id>})`.
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
