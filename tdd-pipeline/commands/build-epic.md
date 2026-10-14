List an epic's open tickets in board order and tag each one buildable, blocked or owner-step,
so you know which tickets can be built now and in what order. Dry run only: it reads Jira and
git, prints the list and stops. No branch, no worktree, no plan, no build.

Triggers: `/tdd-pipeline:build-epic <EPIC-KEY>`, e.g. `/tdd-pipeline:build-epic PROJ-70`.

Epic: $ARGUMENTS

---

### Step 0 — Preconditions

- No key in `$ARGUMENTS` → STOP: "Name the epic: `/tdd-pipeline:build-epic <EPIC-KEY>`."
- Run the Wiring check and Detection in `${CLAUDE_PLUGIN_ROOT}/references/jira-mcp.md`. This
  command is entirely about the ticket: no `Jira:` line, or no Atlassian MCP → STOP with that
  file's one line.
- Determine `<default>` per `${CLAUDE_PLUGIN_ROOT}/references/git-host.md`, then
  `git fetch origin <default> -q`.
- Worktree check: a JS repo (`package.json` at the root) or an iOS repo (`Podfile` or a
  `*.xcodeproj`) with no `.worktreeinclude` at the root → STOP:
  "❌ No `.worktreeinclude`: a worktree of this repo starts without its gitignored files
  (`.env`, `node_modules`, `Pods`). List the ones a build needs in `.worktreeinclude`, then re-run."

### Step 1 — Read the epic's open children

One call to the resolved *search issues by JQL* tool:

```
parent = <EPIC> AND statusCategory != Done ORDER BY rank ASC
```

Ask for fields `summary`, `status`, `issuetype`, `issuelinks` (50 results). One plain line each, then STOP:
- the key does not exist or is not an epic → "❌ <EPIC> is not an epic."
- zero rows → "✅ <EPIC> has no open children."
- the call fails → "⚠️ Jira unreachable: <error text>."

### Step 2 — Tag each child

Read blockers as `${CLAUDE_PLUGIN_ROOT}/references/jira-mcp.md` describes (`issuelinks`, the
"is blocked by" side). For each child, first match wins:

1. **BLOCKED by X** — X is a blocker not yet on the default branch. X counts as merged only when
   `git log origin/<default> --oneline -E --grep '\b<X>\b'` prints a commit, never from Jira status:
   a ticket can be Done in Jira while its PR is still open. A title like "BLOCKED (X)" is an extra
   signal, never the rule; when it names a key the links do not, check that key the same way.
2. **owner-step** — the ticket needs something only a person can do: install a hook or edit
   `settings.json`, prove it on a phone or in an app, or wait for a scheduled run. These are
   never built in a parallel worktree.
3. **buildable** — everything else.

### Step 3 — Show the intake list and stop

```
<EPIC> · <N> open · <B> buildable
  1. PROJ-71  buildable   Run log hook
  2. PROJ-72  BLOCKED     by PROJ-71 (not on origin/main)
  3. PROJ-73  owner-step  needs a hook install
```

Board order, one line per child, the reason after the tag. Zero buildable →
"Nothing to build in <EPIC>" plus each child's line.

Then close with: "Dry run only, no build started. Build each buildable ticket in its own
worktree (`git worktree add -b feat/<KEY>-<slug> .claude/worktrees/<KEY> origin/<default>`),
run `/tdd-pipeline:build <KEY>` there, then `/tdd-pipeline:ship`. Add `.claude/worktrees/` to `.gitignore`."

## Gotchas

- Jira "Done" is not merged code. A blocker whose PR is still open, or that was built in another
  repo, has no commit here: it stays BLOCKED until its key shows up on origin/<default>.
- A squash merge keeps the key only when the PR title or commit message carried it. When a blocker
  merged without its key, the child stays BLOCKED; say so in the reason so the user can override.
- Never widen the JQL past the epic's children, and never build from this command.
