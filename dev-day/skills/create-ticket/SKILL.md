---
name: "create-ticket"
description: "Create a Jira ticket in the current project from a short context blurb. Discovers the project's Jira config (cloudId + key) from its CLAUDE.md, fetches the real issue types, asks type then context, drafts a title + description (structured body for Bugs), shows the draft for inline edit, and creates only after explicit approval. Use on 'create a ticket', 'create a jira', 'file a jira', 'new issue', 'open a ticket'. Global; project-agnostic; NEVER auto-creates."
---

# create-ticket

Turns a one-line intent into a properly-formatted Jira ticket in whatever project you're
working in. Discovers the project's Jira coordinates from its `CLAUDE.md`, fetches the real
issue types from Jira, asks for the type and a free-text context blurb, drafts the **title**
and **description**, shows the draft for **inline edit**, and creates the issue via the
Atlassian MCP **only after the user explicitly approves**.

**Hard guard: NEVER call `createJiraIssue` before the user approves the draft.** Ask-before-any-change.

This is the **global** version. A project may also ship a local `create-ticket` skill with its
coordinates baked in; the local one shadows this when present. This skill carries no hardcoded
cloudId / project key / issue types — everything is discovered at runtime.

## Steps

1. **Discover Jira config.** Find the project's Jira line in the loaded `CLAUDE.md` files
   (project root, `.claude/`, or nested), of the form:
   ```
   Jira: cloudId=<uuid> key=<PROJECTKEY>
   ```
   - **Found** → use that `cloudId` + `projectKey`. Also note any workflow/bug-format hints in
     the same CLAUDE.md (see step 5).
   - **Not found** → ask the user for the **cloudId** and **project key** (one `AskUserQuestion`
     or a direct prompt). Do not guess. Offer to look them up via
     `mcp__atlassian__getVisibleJiraProjects` if the user is unsure of the key.

2. **Fetch real issue types.** Call `mcp__atlassian__getJiraProjectIssueTypesMetadata` with the
   discovered `cloudId` + `projectIdOrKey`. Collect the type names (excluding sub-tasks unless
   the user asks for one). Do **not** hardcode Bug/Task/Story — use what the project actually has.

3. **Q1 — issue type.** Ask via `AskUserQuestion` (single-select, header `Type`) with the
   fetched types as options. *"What type of ticket is this?"*

4. **Q2 — context.** Ask the user (free text):
   *"Describe the ticket — what's the problem/feature and any detail you have. I'll draft the
   title and description from this."*
   Do not ask for a title separately — the title is derived from this context.

5. **Draft title + description.** From the context, decide:
   - **Title** — concise, specific summary (no `[TYPE]` prefix; Jira shows the type icon).
   - **Description** — shape depends on type:
     - **Bug** → first check the project `CLAUDE.md` for a defined bug-report format/template.
       If one exists, use **that** (it OVERRIDES the default). Otherwise fill
       `assets/bug-template.md` (the default). Fill each section best-effort from the context;
       use `_TBD_` for anything the user didn't state — never invent root cause/fix/repro you
       weren't told.
     - **Other types** (Task/Story/Epic/etc.) → free-form: a one-paragraph summary plus
       acceptance criteria / notes / scope as the context warrants. Keep it tight.
     - **Test floor (standing rule 2026-07-08):** any ticket that changes code gets
       "unit tests for <the change>" in its acceptance criteria — no manual-verification-only
       tickets. Skip only for pure docs/config/process tickets.

6. **Self-check (PASS/FAIL — do this BEFORE showing the draft).** Objectively grade the draft
   against these named criteria:
   - **Title** is specific and non-empty (not a generic placeholder).
   - **Every** Bug-template section (from `assets/bug-template.md`) is either filled from the
     user's context or explicitly `_TBD_` — no section left blank. (Non-Bug types: the summary
     and any acceptance criteria are present.)
   - **No invented content** — nothing in root cause / repro / fix / symptom that the user did
     not actually state. Anything unstated must be `_TBD_`, not fabricated. (This gate ENFORCES
     the never-invent rule.)
   - **Issue type** is one of the real types fetched in step 2.

   Emit a verdict line: `TICKET SELF-CHECK: PASS` or `TICKET SELF-CHECK: FAIL — <what failed>`.
   A **FAIL blocks step 7 (showing the draft for approval)** — fix the draft and re-run this
   check until it PASSes; only then proceed.

7. **Confirm (inline edit gate).** Show the user the drafted **Type / Title / Description** in
   full. Ask them to **approve or edit**. If they request changes, apply them, re-run the
   step-6 self-check, and re-show. Loop until they explicitly approve. No `createJiraIssue`
   call happens before approval.

8. **Create.** Call `mcp__atlassian__createJiraIssue`:
   ```
   cloudId:        <discovered>
   projectKey:     <discovered>
   issueTypeName:  <from Q1, exact name as fetched>
   summary:        <approved title>
   description:    <approved body>
   contentFormat:  markdown
   ```
   No `transition` (project default status), no `additional_fields`.

9. **Report.** Print the new issue **key** and **webUrl** from the tool response, e.g.
   `Created PROJ-NN — <webUrl>`.

## Default Bug template

The default structured Bug body lives in **`assets/bug-template.md`** (Symptom / Why it's a bug
/ Root cause / Fix / Verification). Use it **only when the project `CLAUDE.md` defines no bug
format of its own** — a project's bug format OVERRIDES this default. Fill each section from
context; use `_TBD_` for anything the user didn't state — never invent root cause/fix/repro.

## Guards

- **Ask before create.** The draft must be shown and explicitly approved before any
  `createJiraIssue` call. Inline edits loop until approval.
- **Discover, don't hardcode.** cloudId, project key, and issue types are all read at runtime
  (CLAUDE.md + Jira metadata). If the Jira line is missing, ask — never assume.
- **No invention.** Unknown bug fields → `_TBD_`, never fabricated.
- **Default only.** No status transition, priority, labels, components, or assignee.
- **Report key + webUrl** on success.
- **On MCP failure** (auth/offline): report the error and stop. Do not write the ticket anywhere
  else.

## Out of scope

- Status transitions / lifecycle moves (a project's own `/ship`-style skill owns those).
- Subtasks / epic-linking — creates a flat issue by default.
- Project-specific request formats (e.g. catalog/feature-flag tickets) — those belong in a
  dedicated project skill.
