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
3. **`tasks/session-notes.md`** — the 2-line "Left off" note (see below).
4. **Optional task inbox** — if a local task-inbox service is running, first propose CLOSING the
   points this session finished (user confirms; never auto-close), then push this session's
   remaining unfinished points, so they reach a daily brief / phone instead of dying in a
   session-notes file nobody opens. Close before adding — adding first pollutes the list you
   then scan. Skipped silently when no such service is running (see below).

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

The inbox is an optional local HTTP service — any service implementing the small contract below
(`GET /api/todos`, `POST /api/todos/add`, `POST /api/todos/toggle`). Set `TASK_INBOX_URL` to point
at yours; the default is `http://localhost:8765`. It is NOT required infrastructure, and every step
below degrades silently when nothing answers.

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

Set `project` to the current repo's directory name so the inbox groups it correctly.

If a POST fails mid-run, fall back to session-notes for the remaining points and say so in
one line. Never invent a point to have something to push, and cap it at what genuinely
matters: five real items beat fifteen padded ones.

### Optional task-inbox detail — closing points this session finished

The inbox only accumulates if nothing ever closes things, and the user should not have to
tick off work they just watched get done. So before adding new points, propose closures.

**Run this BEFORE the add step above** — adding first pollutes the list you are about to
scan. Reuse the `up`/`down` probe and the open-todo fetch from the dedup step; do not
probe or re-fetch. `down` → skip this silently along with the rest of the inbox step.

For each open todo, ask: **did this session produce evidence it is finished?**

Evidence means LIVE STATE — a merged PR, a Jira status, a tag/branch/file that does or
does not exist, a command's actual output. "I worked on that this session" is not
evidence. Verify from the source; a todo's own text describing what someone intended is
not proof of what happened.

Print two lists, then STOP for one confirmation:

```
Closable (evidence):
  [1] <todo text>  → <the live evidence>

Answered but caveated (read before closing):
  [4] <todo text>  → <what is true> BUT <what is not>
```

The user replies with numbers, `all`, or `none`. Then per chosen id:

```bash
curl -s -X POST "${TASK_INBOX_URL:-http://localhost:8765}/api/todos/toggle" \
  -H 'Content-Type: application/json' -d '{"id":"<todo id>"}'
```

Read the list back afterwards and confirm each one actually flipped — a 200 is not proof
the state changed. Report how many closed, and name any that did not.

**Three rules, each from a real miss:**

- **A parent ticket reaching Done NEVER closes a follow-up todo.** "PROJ-12 is Done" does
  not close "file the 2 defects found during PROJ-12" — the parent shipped, that work did
  not. A naive ticket-status rule wrongly closes every todo of this shape.
- **Any caveat puts it in list two, never list one.** "Confirm the scheduled job fired
  unattended" can be literally satisfied while the job breaks days later and stays broken.
  Closing it silently buries a live outage.
- **If the referenced artifact cannot be found at all, it is NOT closable.** A todo naming
  a branch and SHA that exist nowhere is unverifiable, not done. Say which, and why.

**Never close a todo the user did not pick.** Silence is not consent, and a wrongly closed
todo is invisible afterwards — strictly worse than one that lingers. When unsure which
list an item belongs in, it goes in the caveated one.

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
  merge-feedback's output), any memory files added/updated, the "Left off" note, and how many
  todos were closed plus how many open points went to the task inbox (omit both inbox clauses
  entirely when no inbox was reachable — the points went to session-notes instead).
- Closing todos is the only step here that MUTATES state the user can't easily undo. It is gated
  on their explicit picks, never on inference — see the three rules in the closing section.

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
  THIS session. A note carried over unchanged from the previous session is a FAIL, not a pass.
- **Closure step:** if todo closure is still awaiting the user's picks, it is reported as
  PENDING. Reporting a count (including "0 todos closed") while the decision is unmade is a FAIL.

Report `END-SESSION SELF-CHECK: PASS` or `FAIL — <what did not land>`. A FAIL means write the
missing artifact before finishing; it does not mean re-running the whole skill.

## Gotchas

- A ticket closed on an accept-the-risk decision is NOT evidence its todo is done — the work shipped unvalidated, so check WHY it reached Done before listing it as closable, or a knowingly-unproven fix gets silently buried.
- When the user names a todo in their own words, match it against the STORED text before acting — a paraphrase can keyword-match a different row entirely, and the thing they want may already exist rather than being open work. Quote the row back verbatim and confirm which item they mean.
- The closure step STOPS for the user's picks, so report it as awaiting an answer, never as a finished count — writing "0 todos closed" in the final summary reads as a completed outcome when the decision is still pending, and the user then has to re-ask what is blocking.
- Present each closure candidate by its CONTENT first, never by its raw todo id — ids are internal handles the user does not recognise, and an id-led list forces them to ask what each row is before they can decide.
- If closing a todo requires a destructive step (clearing app data, deleting a model, resetting state), enumerate what that step destroys and offer a preserve-then-restore path BEFORE running it — a verification that costs the user hours of re-pushed data is not worth the closed row.
