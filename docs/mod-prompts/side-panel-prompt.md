(Built: this prompt became mods/side-panel. Kept for the decisions it records.)

Build a right-side docked panel mod and restack the Next Steps rows. Work in a local mods folder (not a git repo, no Jira).

Run this as a local Claude Code session in that mods folder. Load the `plugin-authoring` skill first. Read these before planning:
- mods/next-steps/hooks/register.tsx (how the band draws today; option buttons at :68-73, send/yes/dismiss at :82-86)
- mods/next-steps/docs/ui-reference.md (the target look, from the Claude desktop video)
- mods/cache-keeper/hooks/register.tsx (second AbovePrompt band; the upper band must `await next(e)` or the lower never draws)
- your notes of verified mod API facts and traps

## Why
The right side of the fullscreen terminal sits empty. Goal: show, at a glance, what needs you: memories, pending todos, things waiting on your input, Jira items, and what this session is discussing. Separately, the Next Steps rows read as inline text; they should look like the stacked numbered list in the desktop video.

## What already exists (reuse, do not rebuild)
- Mod layout to copy: `.claude-plugin/plugin.json`, `hooks/hooks.json` (`{"modules":["./register.tsx"]}`), `register.tsx`, pure logic in its own `.ts` with a `.test.ts`, `types/`, `tsconfig.json`. No shared helper code between mods today.
- Pane API: `$.ui.open({ id, title })` + a `ui.render` hook for `{ component: "Pane" }`. In the fullscreen layout a pane docks beside the transcript from 110 columns; unasked it is placed from 144 columns, below that it waits undrawn (`isPlaced: false`). No mod uses a Pane yet.
- Fullscreen layout must be on: `"tui": "fullscreen"` in `~/.claude/settings.json`.
- `$.http.fetch` can call localhost.
- Data sources, all local, no new server:
  - A local assistant service `http://127.0.0.1:<port>/api/cards`: keys `needs_you` (ranked list: rank, source, key, text, url, deadline, is_prod, why), `overdue`, `items`, `ideas`, `stale`, `age_min`. This is the "needs my input" list and carries Jira items. `/api/jira?project=KEY` queries Jira live.
  - A local dashboard service `http://127.0.0.1:<port>/api/todos` (todos) and `/api/pending` (session-notes, todo.md, backlog memories across projects).
  - Memories: `~/.claude/memory/MEMORY.md` (global index) and `~/.claude/projects/<cwd-slug>/memory/MEMORY.md` (this project's index).
- Next Steps already draws each option as a `plain` Button with digit hotkeys 1-7, send 8, yes-to-all 9, dismiss 0. The change is layout, not new buttons.

## Decided (do not relitigate)
- No Jira for these mods. No tickets, no Jira writes. Showing Jira items read from the assistant service in the panel is fine.
- The panel opens always, on its own, when the terminal is wide enough (the dock's own width rule). No key needed to open it.
- Panel and Next Steps restack are one piece of work, built together.
- Terminal (iTerm) first; desktop Code tab second.
- Build as a dev mod in-session, live-test in iTerm, decide packaging only after it looks right.
- Digit hotkeys stay (chosen over letters knowing the risk).
- Sources are the assistant service, the dashboard service and the two MEMORY.md files. Any other local service is skipped.
- Panel rows are display-only in v1: no clicks, no opening URLs, no filling the prompt.

## Do
1. Plan first and stop for the owner's approval before writing code.
2. New mod folder in the mods folder (folder name: ask the owner, do not invent one). On session start, open one pane on the right. One pane with stacked sections, not one pane per section.
3. Sections, each with a small count in its header and a few rows: Needs my input (`needs_you`), Jira (from the assistant service), Pending todos (`/api/todos`), Memories (recent entries from the two MEMORY.md files), What we're discussing (built from this session's own turns).
4. A down server shows one dim line in its section ("<service> offline"), never an error wall and never a blank pane. Mark stale data (`stale: true` / `age_min`).
5. Refresh on a timer and on `turn.complete`; keep fetches cheap (no fetch per render).
6. Next Steps: restack to the layout in ui-reference.md, one row per item, number first, full text, `0 dismiss` last. Keep send/yes-to-all/dismiss behavior and the risky-only-fill rule unchanged.
7. Pure logic (parsing the service payloads, picking rows, trimming) in a `.ts` with a `.test.ts`; mutation-test each check so it is proven to fail.

## Do NOT
- Do not edit ~/.zshrc, settings.json, or any other config; give the owner `!` commands instead.
- Do not edit a mod's files during the turn the owner is live-testing it.
- Do not add a server, a database, or write-back actions (closing todos, answering assistant items). Read-only.
- Do not use any other local service as a source (often down, and its memory view covers only its own project).
- Do not invent names for the mod or its sections beyond the plain labels above.
- No AI attribution anywhere.

## Hard questions for the owner (ask, do not guess)
1. Folder/mod name.
2. "What we're discussing": last N user prompts trimmed, or a one-line topic the mod keeps updated? Where does the text come from, and how many lines?
3. Next Steps rows are questions with options, not single prompts like the video. Stack options under each question (more rows), or keep options on the question's line and only move to one question per row with boxed numbers?
4. Section order, and rows per section.

## Done means
- In a wide fullscreen iTerm window the pane appears on the right with no command; in a narrow one it waits and appears when widened.
- Each section shows live data from its source; stopping the dashboard service shows the offline line, not a crash.
- Next Steps shows the stacked layout; send/yes/dismiss and risky-only-fill still work.
- `.test.ts` suites pass (paste the pass/fail summary line) and each check was shown to fail under a mutation.
- Live-tested in iTerm and confirmed by screenshot.

Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output) vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.
