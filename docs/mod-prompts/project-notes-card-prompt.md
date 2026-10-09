Build the Project notes card: a side-panel card showing the notes that belong to the project the session is open in. Local build, no Jira. Source repo: this repo (public), mod at mods/side-panel. Branch off main as feat/project-notes; open a PR, the owner merges.

Origin: a public PDF "8 mods worth building", #08 "Notes that stay per project". Overview: kept outside the repo (marked Partly).

Read first: mods/side-panel/hooks/register.tsx (`refresh()`, `projectKey()`, the `sections` atom, the `card(...)` render), hooks/panel.ts (`todoSection`, `ROWS`), types/index.d.ts (`Section`), plugin.json `userConfig` (`needs_url`, `todos_url`), panel.test.ts. Load the `plugin-authoring` skill before writing hooks.

## What exists today
- The Todos card is already per project: todos filtered by `project`.
- The card only READS. Adding notes stays with a text editor; no new command.

## Decided
- Storage: a `NOTES.md` file at the root of each repo (committed, or gitignored by the repo's choice). The card reads `<cwd>/NOTES.md`; no config, no new userConfig.
- Read inside the existing `refresh()` (same timer, same `Promise.all`); no second poller.
- Pure parsing in `notes.ts`: `(text) → Section` (newest first, `ROWS` rows, `note` "+N more"). Reuse `Section` and the card renderer; no new card component.
- Missing file or no note lines: hide the card (same rule as an unset URL).

## Do
1. PROBE: can `$.fs.read` read `<cwd>/NOTES.md` at runtime, and what does it return for a missing file? Record it in the PR body.
2. `notes.ts` + tests: list lines, plain lines, a heading with no lines under it, a malformed line (skipped, never throws), more than `ROWS` lines.
3. Mount test over terminal and desktop with an `fs.read` stub, including two cwds with different notes.
4. Bump side-panel's version; README paragraph.

## Do NOT
- No new pane, no poller, no write to the notes file.
- No personal paths, names or hosts in shipped files (public kit).
- No duplicate of `todoSection`: if both need a shared row cap, extract it once.

## Done means
- tsc clean (`npx -p typescript tsc -p mods/side-panel`), `claude plugin validate mods/side-panel`, `claude plugin test mods/side-panel` pass, summary line pasted.
- Mutation check: break the per-repo read, the order and the row cap once each; the suite goes red each time.
- `bash tests/validate.sh` passes.
- Owner screenshot of the card in two different repos showing different notes; until then the PR marks it unverified.
- No AI attribution in commits or the PR body (hard rule).

> Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output)
> vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.
