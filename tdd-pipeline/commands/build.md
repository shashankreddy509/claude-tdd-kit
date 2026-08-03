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

### 0.5. Automation admissibility check (OPTIONAL — requires an automation-approval gate)
- Is this request a DURABLE AUTOMATION — a cron/scheduled job, a hook, a mirror/sync, a recurring
  report, or a new always-on surface? If no, continue to step 1.
- If yes AND your setup has an automation-approval gate, confirm it approved this process before
  planning; a rejected verdict → STOP and report it, since planning a build the gate rejected
  defeats the gate.
- No such gate installed → continue to step 1. This check must never block a build.

### 1. Explore (read-only)
- Enter plan mode.
- Read the codebase relevant to the request. You MAY spawn read-only `Explore`
  subagents in parallel for breadth, or the `planner` subagent as a research helper
  to draft an approach — but those return text to you; they do NOT write any file.
- **UI ticket? Resolve its mock now.** Check the ticket for a mock reference, then the project's
  design directory (CLAUDE.md may name it, e.g. `design/exports/`). Whatever you find goes in the
  plan's `## Design Reference`. A UI ticket with no mock anywhere is worth surfacing — without one
  the build ships generic sample UI instead of the designed screen.

### 1.5 Gating check (only when the project is live)
Read the project CLAUDE.md for a `Gating:` line naming the project's feature-flag store —
a Firestore doc, LaunchDarkly/Unleash, a `feature_flags` table, an env default, or anything
else it already uses. Absent or `off` → skip this step entirely and every gating step below;
a pre-v1 project has no users to protect. Present.

Active → decide which side this ticket needs:
- server work feeding a client surface → **both sides**
- server-only → **server flag**
- client reads the data store directly, no server → **client flag only**
- refactor/tooling/docs, nothing user-facing → **neither**

A flag can have two sides: the **server flag** (off ⇒ the server stops sending the data) and
the **client flag** (off ⇒ the app stops rendering the surface). Either alone starves the
feature, and both **fail closed: absent means OFF**, so a surface renders only on an
affirmative `true` and a kill writes `false` rather than deleting the key. Name keys
`feat_<name>` (long-lived) or `fix_<TICKET>_<slug>` (short-lived rollback lever), identical on
both sides. Seed the keys at `false` and read them back AFTER verify-red and BEFORE
implementation.

Whatever it needs goes in the plan (step 2): the exact keys, the screen the catalog check
wraps, and a gate-off test case per side. Fold the "does this need gating" call into the
step-3 AskUserQuestion when it's genuinely ambiguous — don't guess silently.

### 2. Present the plan INLINE
Show the full plan directly in chat using this format:

# Feature: [name]
## Summary
[2-3 sentences]
## Approach
[architecture decision — why this over alternatives]
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
## Gating  (omit this section entirely when the project has no `Gating: active` line)
- Name: `feat_<name>` for a feature (long-lived) · `fix_<TICKET>_<slug>` for a bug-fix
  rollback lever (retired ~2 weeks after it ships stable). Same name on both sides.
- Server flag: `<key in the project's flag store>` — off ⇒ [what the server stops sending]
- Client flag: `<key in the project's flag store>` — off ⇒ [which screen/component/endpoint
  stops rendering or responding]
- Gate-off tests: [server-off case] · [client-off case] · [absent key ⇒ OFF]
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

### 5. Auto-hand off to implementation (only if "Approve — run pipeline" was chosen)
- Immediately run this plugin's `implement` command against the file you just
  wrote (invoked as `/tdd-pipeline:implement tasks/plans/<TICKET>_plan.md`, or
  whatever namespace this plugin is installed under) — it spawns the
  build-coordinator TDD pipeline on that path. The `implement` command will move
  the Jira ticket to "In Progress" before any code is written (auto-discovered
  from the project's workflow — no hardcoded ids).
- After the implement command finishes (all 5 stages complete, tests pass,
  review clean), the user runs their project's `/ship` ritual to commit,
  push, and open the PR. Then they run this plugin's `ship` command
  (invoked as `/tdd-pipeline:ship tasks/plans/<TICKET>_plan.md`) to post
  the pipeline summary to Jira and move the ticket to "In Review". The
  full pipeline is **Build → Implement → Ship**; Deploy/Run is a separate
  follow-up (not yet a plugin command).

## Notes
- The legacy root `PLAN.md` convention is superseded by `tasks/plans/<TICKET>_plan.md`.
- Never write the plan file before the user approves it.
