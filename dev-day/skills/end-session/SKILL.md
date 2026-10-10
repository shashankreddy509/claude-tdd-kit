---
name: end-session
description: Captures this session's learnings — preferences, corrections, what worked, what to avoid — by merging them into feedback.md + project memory for future sessions. Utility/persistence skill: it records, it does not review or grade output. Trigger on /end-session or "end session".
---

# End Session

Read the entire conversation from this session. Extract and synthesize everything the user revealed about how they want to work.

## Output — four artifacts

1. **`tasks/feedback.md` — DELEGATE to the `merge-feedback` skill.** Invoke it. It owns the synthesis
   of this session's preferences/corrections into the five sections and the never-delete / superset
   merge rules (with its own SUPERSET-CHECK). Do NOT reimplement that merge logic here — call the
   skill. (This is the single source of truth for the feedback merge, shared with start-session's
   auto-capture.)
2. **The project memory vault** — update the persistent memory for the **current** project, never a
   hardcoded path. Derive the path from cwd: replace every `/` with `-`, write under
   `~/.claude/projects/<that-slug>/memory/` (create if absent). One durable fact per file with
   frontmatter + a one-line `MEMORY.md` pointer. Merge, don't replace: read the existing file first,
   preserve prior facts, only correct one if this session proved it wrong (and say so). Save only
   durable, non-obvious facts — not what git/the repo records, and not behavioral preferences (those
   go to feedback via `merge-feedback`).
3. **`tasks/session-notes.md`** — the 2-line "Left off" note plus `## Open points` (see below).
4. **Optional task inbox** — see "Optional task-inbox hook" below; skipped silently when absent.

### session-notes.md detail

The "Left off" note is exactly two lines describing where work stopped, so the next `/start-session`
can resume cleanly (it reads this file):

```markdown
- <the task that was mid-progress when the session ended>
- <the next concrete step to take>

## Open points
- <each thing left undone this session, one line, with its next action>
```

Synthesize from the actual work done this session. Unlike feedback.md (append/merge-only via
`merge-feedback`), this file is living state — OVERWRITE it each session. If no substantive work
happened, write a single line: `- no substantive work this session`. Task tracking itself stays in
Jira — this is only the "where I stopped" pointer, not a backlog.

ALWAYS write `## Open points`: every item this session left undone, not proven, or parked, so the
next `/start-session` shows them. Write `- none` when nothing is open. Never drop one to keep the
note short; a point left out of this file is lost when the session ends.

### Optional task-inbox hook

If `TASK_INBOX_URL` names a local task-inbox service, push this session's unfinished points
(concrete, with a next action; no duplicates of open ones) there so they outlive the overwritten
"Left off" note, and propose closing finished ones only on live-state evidence and the user's explicit
picks. When it is unset or nothing answers, skip silently. Either way the points also go under
`## Open points` in `tasks/session-notes.md`, since `/start-session` reads only that file.

## Compact-aware (the session may have been compacted)

This runs at session close, after work that may have been `/compact`-ed. A compaction summary is
LOSSY — a correction made hours ago may be vague or gone in it. Because `start-session`'s auto-capture
rule appends corrections/preferences to disk AT THE MOMENT they happen:

- Treat the already-written `tasks/feedback.md` and the project memory vault as the SOURCE OF TRUTH.
  The conversation/summary is SUPPLEMENTARY — use it to ADD what's not yet on disk, not to re-derive
  everything from scratch.
- Do NOT overwrite or contradict an on-disk feedback/memory entry just because the summary doesn't
  mention it — absence in a lossy summary is not evidence it didn't happen.
- If auto-capture was working, end-session is mostly RECONCILIATION: confirm the day's captures
  landed, add anything missed, write the session-notes handoff. Don't duplicate what's already there.

## Rules

- Scan the FULL conversation — don't summarize only recent turns. This is the input to all four
  artifacts.
- The feedback merge rules (never-delete, superset, ≤20 words, behavioral-only, no code snippets)
  live in `merge-feedback` — don't restate or reimplement them here; just invoke it.
- After all four updates, report a one-line summary: how many feedback rules captured (from
  merge-feedback's output), any memory files added/updated, and the "Left off" note (plus inbox
  counts only when an inbox was reachable).

## Dashboard review (OPTIONAL — only if the repo ships a dashboard tool; if it does not, skip this step SILENTLY with no message)

Some setups render the captured learnings as keep/drop rows on a local page before they are written.
If the repo defines such a tool (its CLAUDE.md names the command), render the learnings as toggle
rows, then drain the user's picks: a reject applies to that line only, keeping the rest; a commit
proceeds with the current keep/drop set.

If nothing is rendered, nothing is drained, or the user did not interact, write ALL learnings as
normal. This is an optional review layer, never a gate — a dead server must not block the write.

## Self-check (report PASS/FAIL; don't block)

The four artifacts are the deliverable, so verify they LANDED — a session-close that reports
success while nothing reached disk is the failure this gate exists to catch. Re-read each file
after writing; do not assert from the fact that a write was attempted.

- **Feedback merge:** `merge-feedback` owns the superset rule and reports its own
  `SUPERSET-CHECK`. Carry that verdict through verbatim — do NOT re-derive or re-grade it here.
  If it reported FAIL, this gate FAILs too.
- **Memory vault:** every memory file written this session resolves on disk under
  `~/.claude/projects/<slug>/memory/`, and each new file has a matching one-line pointer in
  that vault's `MEMORY.md`. A file with no pointer is an orphan — it will not be recalled.
- **Session-notes:** `tasks/session-notes.md` contains a non-empty "Left off" note dated to
  THIS session, and an `## Open points` section (`- none` counts). A note carried over unchanged
  from the previous session is a FAIL, not a pass.

Report `END-SESSION SELF-CHECK: PASS` or `FAIL — <what did not land>`. A FAIL means write the
missing artifact before finishing; it does not mean re-running the whole skill.

## Gotchas

- When a status/triage document exists for work this session touched, UPDATE IT IN PLACE in the same turn the state changes (merged, deployed, ticket transitioned) and re-render every format it ships in — a board the user reads to know where things stand is worse than useless once stale. Never create a v2 file; the path is what the user returns to.
- A memory file this session DISPROVED must be corrected before writing anything else — amend it in place, say so explicitly, and fix its MEMORY.md pointer line too (a corrected file behind a stale one-line hook still gets recalled wrongly).
- A test suite that was KILLED (memory pressure, timeout, interrupt) can exit 0 and print no "N passed" summary line, so require the summary line itself as evidence; when it is absent, say the run proves nothing.
- A carried-forward item's factual claims describe what the filer BELIEVED, not current state — verify each claim against live state before judging the item closed.
- A carried item with a verified diagnosis is a spec: it is closable only when the fix covers every instance it names; a fix for fewer leaves it open.
- Before a verification step that destroys state (clearing app data, deleting a model, resetting a store), offer a preserve-then-restore path first.
