List an epic's open tickets in board order and tag each one buildable, blocked or owner-step,
so you know which tickets can be built now and in what order. Steps 1-3 only read Jira and git
and print the list. Step 4 builds the buildable tickets one at a time, only when the user says yes.

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
  `*.xcodeproj`) with no `.worktreeinclude` at the root → STOP. Test each marker on its own
  (`[ -e package.json ]`, `[ -e Podfile ]`, `find . -maxdepth 1 -name '*.xcodeproj'`): one `ls` with
  a glob aborts in zsh when the glob matches nothing.
  "❌ No `.worktreeinclude`: a worktree of this repo starts without its gitignored files
  (`.env`, `node_modules`, `Pods`). List the ones a build needs in `.worktreeinclude`, then re-run."

### Step 1 — Read the epic's open children

One call to the resolved *search issues by JQL* tool:

```
parent = <EPIC> AND statusCategory != Done ORDER BY rank ASC
```

Ask for fields `summary`, `status`, `issuetype`, `issuelinks`, `description` (50 results; `description` feeds rule 4), in the tool's fuller view
when its schema has one (see `${CLAUDE_PLUGIN_ROOT}/references/jira-mcp.md`). If `issuelinks` is still
missing from every row, print once: "⚠️ Jira returned no `issuelinks`: blockers come from titles only."
Never read a missing field as "no blockers". One plain line each, then STOP:
- the key does not exist or is not an epic → "❌ <EPIC> is not an epic."
- zero rows → "✅ <EPIC> has no open children."
- the call fails → "⚠️ Jira unreachable: <error text>."

### Step 2 — Tag each child

Read blockers as `${CLAUDE_PLUGIN_ROOT}/references/jira-mcp.md` describes (`issuelinks`, the
"is blocked by" side). For each child, first match wins:

1. **merged, awaiting Done** — the child's own key is in a commit subject on the default branch
   (the same check as below). Its code shipped; it needs a Jira close, not a build.
2. **in flight** — its status category is In Progress (e.g. In Progress, In Review, Build Testing).
   Someone is building or verifying it; never offer it for a second build.
3. **BLOCKED by X** — X is a blocker not yet on the default branch. X counts as merged only when
   `git log origin/<default> --format='%h %s' | grep -E '(^|[^A-Za-z0-9-])<X>([^0-9]|$)'` prints a
   commit, never from Jira status. Subject lines only: a body that merely mentions a key ("voice
   reminders are PROJ-66") is not that ticket's code. Spell the boundary out, not `\b`: macOS
   matches nothing with it and reports no error. Status is no proof either:
   a ticket can be Done in Jira while its PR is still open. A title like "BLOCKED (X)" is an extra
   signal, never the rule; when it names a key the links do not, check that key the same way.
   A merged X still blocks while its own status category is In Progress (e.g. Build Testing): its
   proof is owed. Tag it "BLOCKED by X (merged, still <status>)"; read X's status from the rows,
   or with one issue read when X is outside the epic.
4. **owner-step** — the ticket needs something only a person can do: install a hook or edit
   `settings.json`, run `sudo`, investigate with no code change, prove it on a phone or in an app,
   or wait for a scheduled run. Judge it from each row's `description`, never the title alone; a row
   without one gets one issue read. These are never built in a parallel worktree.
5. **buildable** — everything else.

**Range note.** When no subject carries the child's key but one holds a range that covers it
(`PROJ-120..123` covers 121 to 123; find it with `grep -E '(^|[^A-Za-z0-9-])PROJ-[0-9]+\.\.[0-9]+'`
on the same log), keep the tag and add to its reason: "key only in range subject <sha>, owner may close".

### Step 3 — Show the intake list and stop

```
<EPIC> · <N> open · <B> buildable
  1. PROJ-71  buildable   Run log hook
  2. PROJ-72  BLOCKED     by PROJ-71 (not on origin/main)
  3. PROJ-73  owner-step  needs a hook install
  4. PROJ-74  in flight   Build Testing
  5. PROJ-75  in flight   In Progress (key only in range subject a1b2c3d, owner may close)
```

Board order, one line per child, the reason after the tag. Zero buildable →
"Nothing to build in <EPIC>" plus each child's line.

Any "merged, awaiting Done" or range-note rows → one more line: "Close in Jira, or run
`/tdd-pipeline:validated <KEY>` after you verify: <KEYS>." Print it only; no Jira write.

Zero buildable → stop here. Otherwise one `AskUserQuestion`: "Build the <B> buildable tickets one
at a time?" Yes / No. Yes → Step 4. No → close with: "Dry run only, no build started. Build each buildable ticket in its own
worktree (`git worktree add --no-track -b feat/<KEY>-<slug> .claude/worktrees/<KEY> origin/<default>`),
run `/tdd-pipeline:build <KEY>` there, then `/tdd-pipeline:ship`. Add `.claude/worktrees/` to `.gitignore`."

### Step 4 — Run loop (sequential, main thread)

Preflight once, before the first ticket:
- Test command from the repo CLAUDE.md `Test:` line. No such line → ask the user once for the
  command and add `Test: <command>` as its own line to each plan `/build` writes in this run (the
  coordinator reads it there); never from session memory (run 2: a remembered `python3` was the
  wrong interpreter). Do not write it into CLAUDE.md.
- `.claude/worktrees/` not in `.gitignore` → say so once; keep going.

Then for each buildable ticket, in board order (i of B):
1. `git worktree add --no-track -b feat/<KEY>-<slug> <repo>/.claude/worktrees/<KEY> origin/<default>`,
   where `<repo>` is the absolute path of the main checkout (`git -C <main> worktree add` is refused
   inside a worktree session). Slug = first 4 words of the summary, kebab case, max 30 chars.
2. Load EnterWorktree with ToolSearch (it is deferred), then EnterWorktree on that path.
3. Print "Ticket i of B · <KEY> <summary>", then run `/tdd-pipeline:build <KEY>`. When it asks
   for approval, add **Skip ticket** and **Stop loop** to that same question. `/build` hands off to
   `/implement` with the explicit plan path, and `/implement` runs `/ship` on a complete receipt.
4. ExitWorktree. Print the PR link and one line: "<KEY> shipped, i of B."
   - Skip ticket → ExitWorktree, `git worktree remove` the untouched worktree, `git branch -D` its
     branch, go to the next ticket.
   - Stop loop → ExitWorktree, list the tickets not built, stop.
   - A build that STOPs (red, review Critical, no receipt) → ExitWorktree, keep the worktree, ask:
     next ticket / stop loop.
5. Never call EnterWorktree while a build is running: it moves every running agent's shell and
   git isolation (run 3 lost a coordinator's receipt this way). Next ticket starts only after
   ExitWorktree.
6. User says "merged <KEY>" → run `/tdd-pipeline:merged <KEY>` from the main checkout, between
   tickets, never during a build. It saves the plan + receipt, removes the worktree and parks the ticket.

After the last ticket, re-run Steps 1-3 (expect zero buildable) and stop. The loop never moves a
ticket to Done: `/merged` parks it, `/tdd-pipeline:validated` closes it.

## Gotchas

- Jira "Done" is not merged code. A blocker whose PR is still open, or that was built in another
  repo, has no commit here: it stays BLOCKED until its key shows up on origin/<default>.
- A merge counts only when the commit subject carries the key (a PR title, or a merge subject naming
  `feat/<KEY>-...`). A range like "PROJ-120..123" names PROJ-120 only; Step 2's range note flags
  the rest for the user.
- Never widen the JQL past the epic's children, and never build without the Step 3 yes.
- One writable worktree per session. The loop is sequential; parallel builds need one session per ticket.
