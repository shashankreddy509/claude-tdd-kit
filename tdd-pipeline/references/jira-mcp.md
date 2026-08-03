# Jira MCP dialect resolution

Every Jira step in this plugin routes through this file. Do not hardcode an Atlassian MCP
tool name anywhere else.

## Why this exists

There is more than one Atlassian MCP server in the wild and they do NOT share a tool
surface. Two known dialects:

| | Dialect A | Dialect B |
|---|---|---|
| Names | camelCase, `mcp__atlassian__getJiraIssue` | snake_case under a `jira` prefix, e.g. `..._jira_get_issue` |
| Site | `cloudId` is a **required** parameter | no `cloudId` — the server resolves the site internally |
| Issue arg | `issueIdOrKey` | `issue_key` |

A plugin written against one dialect does nothing useful on the other. Detect, then call.

**Never "try one and fall back on error."** A transition is a write. A failed-then-retried
write against an unknown server risks double-firing or landing a ticket in the wrong state.
Detection below is read-only and runs once.

## Detection (once per command invocation — reuse the result for every later Jira call)

**Step 1 — probe dialect A by exact name.**

```
ToolSearch("select:mcp__atlassian__getTransitionsForJiraIssue,mcp__atlassian__transitionJiraIssue,mcp__atlassian__addCommentToJiraIssue,mcp__atlassian__getJiraIssue")
```

Schemas come back → **dialect A**. Use the names above.

**Step 2 — if step 1 returns nothing, probe by keyword.**

```
ToolSearch("jira transition issue comment")
```

Read the returned schemas and take the tool names and parameter names *from the schemas
themselves*. Do NOT assume the snake_case spellings in the table above are exact — that
table is documentation, the schema is truth. Match by what each tool does:

| Need | Pick the returned tool that | 
|---|---|
| list transitions | gets/lists transitions for one issue |
| apply a transition | transitions/moves an issue, takes a transition id |
| comment | adds a comment to an issue |
| read an issue | gets a single issue's fields |

**Step 3 — neither resolves → no Jira MCP on this machine.**

Skip every Jira step. Log once, plainly, naming what was skipped:

```
⚠️ No Atlassian MCP available — skipping Jira transition to "<STATUS>" for <KEY>.
   Code work continues; the ticket stays where it is.
```

Then proceed. The TDD stages never depend on Jira.

## Calling convention

Derive parameters from the RESOLVED schema, not from a fixed rule.

- **`cloudId` required by the schema** → resolve it: prefer a `Jira: cloudId=<uuid> key=<KEY>`
  line in the project's CLAUDE.md; else `mcp__atlassian__getAccessibleAtlassianResources`
  (dialect A only) and use the returned site id. Never hardcode one — a wrong `cloudId`
  transitions some other project's ticket.
- **`cloudId` not in the schema** → omit it. The `Jira:` line in CLAUDE.md is then unused
  and harmless; leave it alone, other tooling reads it.
- Issue key parameter is whatever the schema calls it (`issueIdOrKey` / `issue_key`).

**Transition ids are per-project and change.** Always list transitions first and match on
the target status NAME, never a hardcoded id. Two projects with identically-named statuses
have different ids behind them.

## Error handling (both dialects)

- 400 "transition not available / not valid from the current status" → the ticket is already
  in or past that status. Log the no-op, proceed.
- Any other error (auth, permissions, project misconfig) → log a one-line warning with the
  error text, proceed.
- No ticket key derivable → skip silently.

The pipeline must never break on Jira being unavailable, misconfigured, or a different
dialect than expected.

## Verification status

Dialect A is **verified** — probed live against a connected Atlassian MCP, all four tools
resolved with `cloudId` required.

Dialect B is **UNVERIFIED**. It is written from a field report of a different Atlassian MCP
plus the keyword-probe fallback in step 2, which is designed to resolve the four verbs even
if the exact snake_case names in this file are wrong. If you run dialect B, please report the
real tool names upstream so this reference can be corrected.
