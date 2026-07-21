---
name: end-session
description: Captures this session's learnings — preferences, corrections, what worked, what to avoid — by merging them into feedback.md + project memory for future sessions. Utility/persistence skill: it records, it does not review or grade output. Trigger on /end-session or "end session".
---

# End Session

Read the entire conversation from this session. Extract and synthesize everything the user revealed about how they want to work.

## Output — three artifacts

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
3. **`tasks/session-notes.md`** — the 2-line "Left off" note (see below).
4. **Optional task inbox** — if a local task-inbox service is running, this session's unfinished
   points go there, so they reach a daily brief / phone instead of dying in a session-notes file
   nobody opens. Skipped silently when no such service is running (see below).

### session-notes.md detail

The "Left off" note is exactly two lines describing where work stopped, so the next `/start-session`
can resume cleanly (it reads this file):

```markdown
- <the task that was mid-progress when the session ended>
- <the next concrete step to take>
```

Synthesize from the actual work done this session. Unlike feedback.md (append/merge-only via
`merge-feedback`), this file is living state — OVERWRITE it each session. If no substantive work
happened, write a single line: `- no substantive work this session`. Task tracking itself stays in
Jira — this is only the "where I stopped" pointer, not a todo list.

### Optional task-inbox detail

The "Left off" note is two lines and gets OVERWRITTEN each session, so anything not
carried forward is lost. If an optional local task inbox is available, push this session's
**open points** there instead — they persist and can surface in a daily brief or on the phone.

The inbox is an optional local HTTP service, default base URL `http://localhost:8765`
(configurable — set `TASK_INBOX_URL` to point elsewhere). It is NOT required infrastructure.

What qualifies: a concrete unfinished thing with a next action. A bug found but not
fixed, a ticket to file, a deploy step deferred, a decision waiting on the user.

What does NOT: work completed this session, behavioral preferences (those go to
`merge-feedback`), durable technical facts (project memory), or vague intentions
("keep an eye on performance").

**Probe FIRST — one fast call, and if it does not answer, skip this whole step silently:**

```bash
curl -s --max-time 2 "${TASK_INBOX_URL:-http://localhost:8765}/api/todos" >/dev/null && echo up || echo down
```

`down` (non-zero exit / timeout / no service) → do NOT retry, do NOT print an error, and
do NOT mention the inbox in the final report. Instead write the open points into
`tasks/session-notes.md` under a `## Open points` heading beneath the two "Left off" lines,
one `- ` bullet each. That is the fallback; the session still ends cleanly.

`up` → **dedup first**, since this runs every session and must not pile up duplicates:

```bash
curl -s --max-time 2 "${TASK_INBOX_URL:-http://localhost:8765}/api/todos" | python3 -c "import json,sys; [print(t['text']) for t in json.load(sys.stdin)['todos'] if not t.get('done')]"
```

Skip anything already open with substantially the same meaning. Then add each new point:

```bash
curl -s -X POST "${TASK_INBOX_URL:-http://localhost:8765}/api/todos/add" \
  -H 'Content-Type: application/json' \
  -d '{"text":"<point>","project":"<repo dir name>","kind":"task"}'
```

Set `project` to the current repo's directory name so the brief groups it correctly.
Video-production work takes `"kind":"video"` and a `"stage"`.

If a POST fails mid-run, fall back to session-notes for the remaining points and say so in
one line. Never invent a point to have something to push, and cap it at what genuinely
matters: five real items beat fifteen padded ones.

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

- Scan the FULL conversation — don't summarize only recent turns. This is the input to all three
  artifacts.
- The feedback merge rules (never-delete, superset, ≤20 words, behavioral-only, no code snippets)
  live in `merge-feedback` — don't restate or reimplement them here; just invoke it.
- After all four updates, report a one-line summary: how many feedback rules captured (from
  merge-feedback's output), any memory files added/updated, the "Left off" note, and how many
  open points went to the task inbox (omit that last clause entirely when no inbox was reachable —
  the points went to session-notes instead).

## Dashboard review (PROJ-53, best-effort — only if `scripts/dashboard.py` exists; if that script is absent, skip this step SILENTLY with no message)

Before writing the merged learnings, optionally let the user keep/drop each via the dashboard (a
dead server never blocks the write — fall back to writing all learnings):
1. **Render** the captured learnings as toggle rows:
   ```bash
   .venv/bin/python scripts/dashboard.py render endsession '{"branch":"<branch>","learnings":[{"id":"l1","text":"…"},{"id":"l2","text":"…"}]}'
   ```
   Page live at `http://localhost:7799` — each row has Keep/Drop; a `Commit kept to memory` button.
2. **Drain** `scripts/dashboard.py drain` — apply `reject_learning {id}` to DROP that line, keep the
   rest; `commit_learnings` = proceed with the current keep/drop set. If the inbox is empty (user
   didn't interact), write ALL learnings as normal — the dashboard is an optional review layer, not
   a gate.
