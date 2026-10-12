Plan a new feature inline, iterate until approved, then auto-hand off to implementation.

This command runs in the MAIN thread (not a subagent) so the plan is shown to you
directly in chat and you can iterate on it in real time. No plan file is written until
you explicitly approve.

Feature request: $ARGUMENTS

## Flow

### 0. Triage-file check (bug path) — DO THIS FIRST
- Derive the ticket key from `$ARGUMENTS` (e.g. `<KEY>`) if one is present.
- If a key is present, check for `tasks/<TICKET>-triage.md` in the open project (a triage artifact
  from any bug-triage workflow). If it exists, this is a **bug fix with a confirmed root cause** —
  do NOT re-explore from scratch:
  - Read the triage artifact. Trust its stated verdict, root cause, affected files, what it excluded
    as adjacent, and any fix-plan seed it proposes.
  - If the verdict is `not-reproducible` / `invalid` / `pre-existing`, STOP and tell the user — there
    is nothing to build; surface the triage recommendation (close it / not our change).
  - If `real-bug`, write a **LEAN fix-plan**: the smallest correct change at the shared point (not
    per-caller), the one test from the seed, and the toggle gate if the seed names one. Skip the
    broad exploration in step 1 — the root cause is already proven. Present it inline (step 2),
    iterate (step 3), and on approval (step 4) write it as the plan file.
- If no triage file, this is the normal feature/plan path — continue to step 1.

### 1. Explore (read-only)
- Enter plan mode.
- Read the codebase relevant to the request. You MAY spawn read-only `Explore`
  subagents in parallel for breadth, or the `planner` subagent as a research helper
  to draft an approach — but those return text to you; they do NOT write any file.
- **Find code to reuse.** Before planning anything new, search the repo for components,
  functions and methods that already do part of the job — the same UI shape (a card, a row, a
  dialog) or the same data read/write — and that this ticket could call with its own data or
  labels. Each one goes in the plan's `## Reuse`. A near-copy the plan never named is the
  duplication the reviewer will block later.
- **UI ticket? Resolve its mock now.** Check the ticket for a mock reference, then the project's
  design directory (CLAUDE.md may name it, e.g. `design/exports/`). Whatever you find goes in the
  plan's `## Design Reference`. A UI ticket with no mock anywhere is worth surfacing — without one
  the build ships generic sample UI instead of the designed screen.

- **New third-party API? Prove it now.** For each external service the plan newly depends on,
  make one live smoke call (auth check + a real sample response) before presenting the plan.
  If a live call isn't possible, list the dependency as UNPROVEN under Risks / Assumptions.

### 1.5 Gating check (optional)
Only if the project CLAUDE.md has a `Gating:` line (not `off`): follow `references/gating.md`
to decide the sides and fill the plan's `## Gating` section. Otherwise skip this step.

### 2. Present the plan INLINE
Show the full plan directly in chat using this format:

# Feature: [name]
## Summary
[2-3 sentences]
## Approach
[architecture decision — why this over alternatives]
## Reuse (existing code to call)
- `Symbol` @ `path:line` — call with [this ticket's data/labels] instead of building [X];
  [any parameter it needs added]
- Nothing fits: "none found — searched: [terms/paths]", so a skipped search is visible.
## Success Criteria
- [observable condition that makes this done — a state someone else could check, not "it works"]
- Prover: [the exact check that proves it landed — a field read back, a hash compared, an exit
  code, a row count. A `200`, a green suite, and "it looked right" are not provers. If nothing in
  this environment can prove it, name the tool that WOULD and state the result will be ASSERTED,
  not verified.]
## Out of Scope
- [explicitly NOT built here — the adjacent thing a reader would assume is included]
## Design Reference
[UI tickets: the mockup path the implementer builds to, e.g. `design/exports/03-editor.png`
(+ any light/dark variant). The mock is the visual contract — it wins over prose on layout.
Resolve it from the ticket's mock reference or the project's design directory. Non-UI ticket:
"n/a". UI ticket with no mock found anywhere: "NONE FOUND — UI from prose only" and flag it.]
## Files to Create
- `path/to/file` — [purpose]
## Files to Modify
- `path/to/existing` — [what changes and why]
## Test Cases to Write
- [Test]: [scenarios]
## Gating  (only when the project has a `Gating:` line — format in `references/gating.md`)
## Risks / Assumptions
- [anything that could go wrong or needs confirmation]

### 3. Ask for approval via AskUserQuestion — DO NOT write any file yet

Immediately after presenting the plan, call `AskUserQuestion` (clickable options,
no typed approval needed) with exactly these options:

- **Approve — run pipeline** (Recommended): write the plan file, then auto-hand
  off to implementation (step 5).
- **Approve — plan file only**: write `tasks/plans/<TICKET>_plan.md` but do NOT
  start the pipeline; user runs `/implement` later.
- **Revise**: user states what to change (or picks "Other" with details). Revise
  the plan inline, re-present, and ask again. Repeat until approved or cancelled.
- **Cancel**: no file written, stop.

Any open questions inside the plan (toggle default, scope choices, etc.) go in
the SAME AskUserQuestion call as additional questions (max 4 total) — one click
session, not a typing exchange.

### 4. On approval ONLY
- Derive `<TICKET>` from the request: a ticket id like `<KEY>` if present;
  otherwise a short kebab-case slug of the feature name.
- Ensure `tasks/plans/` exists (create it if missing).
- Write the full approved plan to `tasks/plans/<TICKET>_plan.md`. This file is the
  permanent per-feature record.
- Optional hook: if `$PLAN_GATE_CMD` is set, run `eval "$PLAN_GATE_CMD" record tasks/plans/<TICKET>_plan.md approve`
  (lets `/implement` tell 'approved' from 'a plan file exists'); unset → skip silently.

### 5. Auto-hand off to implementation (only if "Approve — run pipeline" was chosen)
- Immediately run this plugin's `implement` command against the file you just
  wrote (invoked as `/tdd-pipeline:implement tasks/plans/<TICKET>_plan.md`, or
  whatever namespace this plugin is installed under) — it spawns the
  build-coordinator TDD pipeline on that path. The `implement` command will move
  the Jira ticket to "In Progress" before any code is written (auto-discovered
  from the project's workflow — no hardcoded ids).
- `implement` ships on its own when the pipeline completes: it runs this plugin's
  `ship` command (receipt gate → commit → push → PR → Jira 'In Review'). Full
  pipeline: **Build → Implement → Ship**; deploying is out of scope.

## Notes
- The legacy root `PLAN.md` convention is superseded by `tasks/plans/<TICKET>_plan.md`.
- Never write the plan file before the user approves it.

## Gotchas
- Step 5 hands off to `implement` (the build-coordinator AGENT pipeline) — the ONLY execution model. Never reimplement the pipeline inline in the main thread; it silently skips the independent-reviewer property the agent pipeline exists to provide.
- The feature request may name a ticket from ANOTHER repo/project. Before planning, confirm the ticket key's project matches the open repo — a number outside the project's known range is the tell. Planning against the wrong repo wastes a full exploration pass.
- Spike any load-bearing visibility/API assumption with a throwaway compile BEFORE handing off to `implement`. A route read from a library's sources can still be rejected by the compiler (e.g. Kotlin: `@PublishedApi internal` is callable only inside the declaring module), and finding out mid-pipeline wastes the whole run.
- Confirm a named verification command EXISTS before writing it into the plan's Prover. A plausible-looking task name can be wrong for the module (e.g. Kotlin Multiplatform: an Android-library-based KMP module runs `:shared:testDebugUnitTest`, not `:shared:jvmTest`), and the pipeline then has to correct the plan mid-run.
- A ticket whose deliverable is LOOKING at something is not buildable — check the ticket text for "verify / look at / on screen / owner's eyes" before planning. Its plan has no Files-to-Create and no Test Cases, and its prover is a human; say so and offer the real steps instead of generating an empty plan.
- A `task-notification` saying an agent's report was delivered is NOT proof one arrived — twice a coordinator notified "completed" while only interim status messages reached the main thread. Check for the actual report before acting; if absent, resume the agent and ask for the verdict, and never infer what it would have said.
- A resumed subagent CANNOT see edits its parent made after the subagent handed back, so it reports them as a concurrent-session intrusion with convincing forensics (content diffs, mtime clustering, a correct tool-grant deduction). Account for your OWN post-handback edits before believing it, and tell it explicitly what you changed — letting it "restore" the tree silently reverts your fixes.
