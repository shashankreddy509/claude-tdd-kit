---
name: bug-triage
description: Investigate a Jira bug from its key to a root-cause verdict — classify bug-vs-feature, fan out read-only Explore agents across the repo, adversarially confirm the cause, and write a tasks/<TICKET>-triage.md artifact a lean fix-planner can pick up. Orchestration only; read-only, never touches Jira, stops at verdict + fix-location (no fix, no plan). Use when given a Jira bug key to root-cause, or "triage PROJ-XXXX", "is this a real bug", "where's the root cause", "investigate this ticket". Triggers: triage ticket, root cause this bug, is this a real bug, investigate bug, where is the root cause, bug verdict, analyze bug.
allowed-tools: Read, Grep, Glob, Bash, Task, ToolSearch, Skill, Write
arguments:
  - name: ticket
    description: Jira bug key (e.g. PROJ-42)
    required: true
---

# Bug Triage

The user invoked `/bug-triage` with: **`{{args}}`**

One job: take a Jira **bug** key and drive it to a **root-cause verdict + fix-location**, then write
that result to an artifact a planner can consume. This is **orchestration** — it sequences a fixed
workflow and DELEGATES (Jira fetch, the read-only Explore fan-out, the pre-existing check) rather
than doing analysis it doesn't own. Keep the JUDGMENT here (classify, pick the real root cause,
write the verdict); push the mechanics out to agents/skills.

It is hard-scoped:
- **Read-only.** Never transitions, comments, edits, or assigns the ticket. It only READS Jira.
- **Never writes code.** No fix, not even a fix plan. It stops at the verdict + the file:line where
  the fix belongs, and hands that to a planner via the artifact. (Producing a plan would make it
  straddle into planning — that's the consuming planner's job, gated by the user's plan-gate.)
- **Stops at the artifact.** `tasks/<TICKET>-triage.md` is the contract. The user runs `/build` (or
  `/inline-build`) separately when they choose — those detect the triage file and write a LEAN
  fix-plan from it.

## Gate FIRST

`ticket` is a required argument. If it's missing or ambiguous, STOP and ask — do not guess a key.

**Discover the project's Jira config (cloudId + key) from the project `CLAUDE.md`** — scan it for a
line of the form `Jira: cloudId=<uuid> key=<PROJECTKEY>` and use those values;
never hardcode a cloudId. If not found, ask for the cloudId + key. Normalize the ticket to `<KEY>-NNNN`.

## Steps

### 1. Fetch the ticket (delegate the live read)
Load the tool and read the ticket:
```
ToolSearch "select:mcp__atlassian__getJiraIssue"
mcp__atlassian__getJiraIssue(cloudId=<discovered>, issueIdOrKey=<TICKET>)
```
Capture: summary, description, **issuetype**, **assignee**, status, priority, labels, parent epic,
and the comment thread.

### 2. Classify + gate the type
- **Ownership flag (report, don't act):** if `assignee` is not the current user, say so in one line.
  Triage proceeds regardless — it's read-only — but the user should know.
- **Bug-vs-feature gate:** if `issuetype != Bug`, STOP and say so plainly: this is a
  story/feature/task, and triage is the bug path — the feature path is `/build` (the planner). Do
  not fan out root-cause agents on a feature.

### 3. Extract the repro signal
From the description pull **Steps / Expected / Actual** verbatim. If the bug hinges on a visual
detail and the ticket has screenshots, fetch them (`mcp__atlassian__fetch` on the attachment).
State the one-line repro you'll be root-causing, so a wrong reading can be corrected early.

### 4. Fan out root-cause Explore agents (delegate, read-only)
Spawn parallel `Explore` agents (Task tool, `subagent_type: Explore`) scoped to the OPEN repo (this
is a single-repo project — no sibling fan-out). Use at least two complementary angles so one blind
spot doesn't sink the result:
- **Symptom finder:** locate the user-facing string / error / element / API response field from the
  repro — exact key + file:line + every code site that produces it.
- **Mechanism finder:** locate the branch/condition/default that DECIDES the observed (wrong)
  behavior vs the expected one — the gate, the hardcoded value, the missing check. For BTC:
  - **Web:** the FastAPI route, the Firestore read/write, the `_fs.load_feature_toggles()` gate, the
    scanner/trade logic.
  - **Android:** the ViewModel branch, the `catalogOn(flag)` gate in `CatalogFlags.kt`, the repository.

Each agent must return `file:path:line` + a short quoted snippet for every finding, and edit nothing.
Tip: for a cross-module "how does X relate to Y" angle on the web repo, `graphify query` traverses
the graph's edges better than grep.

### 5. Adversarially confirm the cause (the step that makes the verdict trustworthy)
Do NOT accept the first plausible chain. Finders often disagree or surface adjacent-but-wrong sites.
Before declaring a root cause:
- **Read the decisive lines yourself, on disk** (Read/Grep) — never declare a root cause on an
  agent's inference alone. Confirm the cited branch actually executes for THIS repro.
- If two finders disagree, resolve it by reading both candidates and asking "which branch does the
  ticket's exact repro enter?" Name the loser and why it's out of scope.
- Optionally spawn one refute agent: "here is the claimed root cause + repro — try to prove this
  branch does NOT run for these steps." If it refutes convincingly, re-open the search.

### 6. Verdict
Decide one of:
- **`real-bug`** — root cause confirmed. Give the file:line chain (origin → decision point →
  user-visible effect), the affected files, and the lever for the fix (existing helper/flag to use).
- **`not-reproducible`** — the code path can't produce the reported behavior. Say why; recommend
  closing as not-repro/invalid.
- **`pre-existing`** — the failure isn't from any recent change. If there's a build/test failure in
  play, delegate the attribution to `prove-pre-existing` and report its verdict.
- **`invalid`** — the expectation in the ticket is wrong (behavior is by design / matches spec).

### 7. Write the artifact
Write `tasks/<TICKET>-triage.md` in the OPEN project's `tasks/` dir, using
`assets/triage-template.md` as the structure. This file is the planner contract. Then tell the user
it's written and that they can run `/build` or `/inline-build` against it when ready — do NOT start
planning here.

## Self-check (report PASS/FAIL; don't silently block)

Before declaring done, verify YOUR OWN output and report a verdict:
- **Citations resolve (correctness):** for EVERY `file:line` in the verdict/artifact, the file
  exists and the quoted snippet is actually present at/near that line (re-Grep the snippet). Any
  citation that doesn't resolve is a FAIL — fix it or drop the claim.
- **Verdict is one of the four** and matches the evidence (a `real-bug` verdict must carry a
  confirmed file:line chain, not a maybe).
- **Scope honesty:** if any agent finding was excluded as adjacent/out-of-scope, the artifact says
  so — silent omission reads as "fully covered" when it wasn't.

Report `TRIAGE SELF-CHECK: PASS` or `FAIL — <misses>`. On FAIL, surface it.

## Guardrails

- **Read-only on Jira, always.** Never call transition / addComment / editJiraIssue / assign. If the
  user then wants to post the disposition, offer a paste-ready comment for them to post themselves;
  do not post it from here.
- **No code, no plan.** Stop at verdict + fix-location + artifact.
- **Don't trust an agent's root cause unread** — confirm the decisive lines on disk before the
  verdict. A wrong file set shipped as confident is the failure mode this skill exists to prevent.
- **Respect a named module scope** — if the user says the bug is in area X, don't report findings
  from area Y as the cause (note them as adjacent at most).
