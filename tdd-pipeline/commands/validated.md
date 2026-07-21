Manual-validation sign-off: record what you verified, then move the ticket from its
verification column to **Done**.

This is Stage 5, the last of the gated pipeline (Build → Implement → Ship → Merged →
**Validated**). Run it after `/tdd-pipeline:merged` parked the ticket in a verification
column and you actually validated the change on a real build.

Triggers: `/tdd-pipeline:validated <KEY> [note]`, e.g.
`/tdd-pipeline:validated PROJ-12 verified on device, rate limiter holds under load`.

**This is the ONLY command in the pipeline that moves a ticket to Done.** That's the point:
Done should mean *validated*, not merely *merged*. `merged` deliberately stops short.

---

### Step 0 — Resolve context

- `<KEY>` from the argument, else the newest `tasks/plans/*_plan.md`, else the branch name.
  With no key, stop and ask — this command is entirely about the ticket.
- Resolve `cloudId` ONCE: prefer a `Jira: cloudId=<uuid> key=<KEY>` line in the project's
  CLAUDE.md; else `mcp__atlassian__getAccessibleAtlassianResources`. Never hardcode it.

### Step 1 — Gate on the current status

```
mcp__atlassian__getJiraIssue(cloudId=<cloudId>, issueIdOrKey=<KEY>, fields=["status"])
```

- Status is a **verification column** ("Build Testing", "QA", "Testing", "Verify") → proceed.
- Status is already **Done** → say so and stop. Nothing to do.
- Status is anything earlier (To Do, In Progress, In Review) → **stop**. The work hasn't
  been merged and parked yet; point the user at `/tdd-pipeline:merged` first. Closing a
  ticket that never reached verification is exactly what this gate exists to prevent.

If the board has no verification column at all, `merged` already moved the ticket to Done
and this command has no role — say so and stop.

### Step 2 — Capture the validation note

The note is the record of what *you* checked, so it must come from the user, not be invented.

- If the user supplied one in the argument, use it verbatim.
- If not, ask what they validated. Do not synthesise a note, and do not proceed with a
  generic "validated" — a sign-off with no content is worse than no sign-off, because it
  looks like evidence.

### Step 3 — Post the validation comment

Plain text only — the MCP's markdown→ADF conversion leaks literal `**` and renders tables
unreliably.

```
Validated: <the user's note>
Validated by: <the user>
Date: <ISO date>
```

```
mcp__atlassian__addCommentToJiraIssue(cloudId=<cloudId>, issueIdOrKey=<KEY>,
    body=<plain text>, contentFormat="markdown")
```

**Post the comment BEFORE the transition.** If the comment fails, stop rather than closing a
ticket with no record of what was verified — the audit trail is the reason this command exists.

### Step 4 — Move to Done

```
mcp__atlassian__getTransitionsForJiraIssue(cloudId=<cloudId>, issueIdOrKey=<KEY>)
```

Find the transition whose `to.name` is "Done", or whose `to.statusCategory.key` is `done`.
**Discover the id — never hardcode it**; ids differ per project even on one site.

```
mcp__atlassian__transitionJiraIssue(cloudId=<cloudId>, issueIdOrKey=<KEY>,
    transition={"id": "<discovered id>"})
```

If no Done transition is reachable from the current status, report the available ones and
ask rather than guessing.

### Step 5 — Report

```
✅ <KEY> validated and closed
   "<the note>"
```

---

## Validation failed instead?

Don't run this command. File a bug linked to the ticket and leave it in the verification
column — that's the honest state. `/tdd-pipeline:build` can then start the fix as its own
piece of work.

---

## Notes

- Gated on the current status: refuses to close a ticket that never reached verification.
- The comment lands before the transition, so a closed ticket always carries its evidence.
- The note comes from the user. Never fabricate a validation record.
- Nothing hardcoded: no cloudId, site, key, transition id, or status name-to-id mapping.
- Idempotent: an already-Done ticket is a no-op, not an error.

## Examples

```
/tdd-pipeline:validated PROJ-12 verified on a real device, no regression in the auth flow
# → comments the note, moves PROJ-12 → Done

/tdd-pipeline:validated PROJ-12
# → asks what was validated, then comments and closes

/tdd-pipeline:validated PROJ-9
# → PROJ-9 is In Review, not in a verification column → stops and says so
```
