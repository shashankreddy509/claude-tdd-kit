---
name: groom
description: Pre-grooming analysis of a Jira ticket — produce a readiness + spec brief so the ticket can be groomed/estimated. Read-only; writes ONE artifact (tasks/<TICKET>-grooming.md), touches no code and no Jira. Runs BEFORE a ticket is approved to work — answers "is this ready to estimate, and what will it touch", not "how do I build it" (that's /build). Never plans an implementation, never sets a story-point number, never edits Jira. Use on "/groom <TICKET>", "groom this ticket", "is this ready to estimate", "pre-grooming brief".
allowed-tools: Read, Grep, Glob, Bash, Task, ToolSearch, Skill, Write
arguments:
  - name: ticket
    description: Jira ticket key (e.g. PROJ-42)
    required: true
---

# Groom — pre-grooming readiness brief

The user invoked `/groom` with: **`{{args}}`**

Pre-grooming analysis of a Jira ticket: a readiness + spec brief so the ticket can be
groomed/estimated. Read-only — writes ONE artifact, touches no code and no Jira. If no argument, ask
which ticket.

This runs BEFORE a ticket is approved to work. It answers "is this ready to estimate, and what will
it touch" — not "how do I fix/build it" (that's `/build`, after grooming). It never plans an
implementation, never assigns a story-point number, never edits Jira.

**Discover the project's Jira config (cloudId + key) from the project `CLAUDE.md`** — scan it for a
line of the form `Jira: cloudId=<uuid> key=<PROJECTKEY>` and use those values;
never hardcode a cloudId. If not found, ask for the cloudId + key.

**Then resolve the Jira MCP dialect.** Atlassian MCP servers differ per machine: one exposes
camelCase names (`mcp__atlassian__getJiraIssue`) with `cloudId` REQUIRED; another exposes snake_case
under a `jira` prefix and resolves the site internally, with no `cloudId` at all. If the
`tdd-pipeline` plugin is installed, follow its `references/jira-mcp.md`. Otherwise probe inline: try
the camelCase name via `ToolSearch`; if nothing resolves, search by keyword (`ToolSearch "+jira
issue"`) and use what comes back. Pass `cloudId` ONLY when the resolved schema has it — otherwise
omit it and ignore the `cloudId=` half of the line. Never hardcode a tool name.

## Steps

1. **Fetch the ticket.** Using the get-issue verb resolved above:
   `<get-issue tool>(issueIdOrKey=<TICKET>)`, adding `cloudId=<discovered>` only if its schema
   requires it. Also pull linked/sibling issues and
   attachments if referenced. Capture summary, description, issuetype, acceptance criteria, parent
   epic, comments.

2. **Restate the ask.** One paragraph: what is actually being requested, in your own words, so a
   wrong reading surfaces at grooming — not mid-sprint. State assumptions explicitly.

3. **Acceptance-criteria audit.** List the ACs verbatim. For each, judge: present? testable
   (observable pass/fail)? Flag missing, vague, or contradictory ACs as blockers to estimate — a
   ticket without testable ACs is not groom-ready.

4. **Business spec.** What user-facing behavior changes, for whom, under what conditions (auth state,
   user role, environment, flow). Note edge cases the ticket implies but doesn't state.

5. **Technical spec — codebase reality.** Anchor the ticket in the real code — where the feature
   lives today, what gates it, which modules a change would touch, the contracts involved:
   - **Backend / web:** identify the route handler(s), the data stores/collections touched, and any
     feature-flag or config gate the behavior sits behind. If the repo has a knowledge graph
     (`graphify-out/GRAPH_REPORT.md`), read it and prefer `graphify query "<subject>"` /
     `graphify explain "<concept>"` over grep — it traverses cross-module edges grep can't see.
   - **Mobile / client:** map the screen → ViewModel/presenter → repository chain, plus any
     feature-flag gate. Use an `Explore` agent (Task tool) for the cross-file map.
   - If the ticket is net-new with no existing code hook, say so plainly ("net-new; no existing code
     to anchor to") — do NOT fabricate a codebase reality that doesn't exist yet.
   - Enumerate likely **API contracts** (new/changed endpoints, request/response shapes) from the
     description, marked as inferred vs confirmed.
   - Sketch the **test matrix**: what unit coverage (using the project's own test runner) and any
     manual/on-device coverage this needs — so test effort is visible at estimate time.

6. **Dependency / twin check.** Does real behavior depend on something not yet shipped — a server
   change, a schema/data migration, a contract between two clients or services, another ticket?
   Check links/labels/parent and flag "blocked on <dependency>" if so.

7. **Open questions / gaps to resolve before estimating.** The decisions that must be made first:
   missing ACs, undecided business rules, unconfirmed contracts, analytics/observability not
   specified.

8. **Complexity signal (NOT a point value).** Small / Medium / Large + the 1–2 reasons, grounded in
   step 5's codebase reality (modules touched, contract changes, test surface, dependency). This
   informs the estimate; it does not replace it.

9. **Write the brief to `tasks/<TICKET>-grooming.md`** in the open project, alongside the other
   per-ticket artifacts, using `assets/grooming-template.md` as the structure — fill every section
   (restate / AC-audit / business spec / technical spec / dependency / open-questions / complexity /
   inferred-vs-confirmed / self-check) from steps 1–8; do not restate the section list here. Tell the
   user it's written. Stop — do not plan or build.

## Self-check (report PASS/FAIL; don't block)

- Every cited `file:line` from step 5 resolves (re-Grep the snippet).
- ACs are reproduced verbatim, not paraphrased.
- Anything inferred (contracts, edge cases) is labeled inferred, not stated as fact.
Report `GROOM SELF-CHECK: PASS` or `FAIL — <misses>`.

## Guardrails

- Read-only on Jira and code. No edits, no transitions, no comments.
- No implementation plan and no story-point number — those are `/build` and the team, respectively.
- If the Jira call fails, say so in one line; never fabricate ticket content or ACs.
