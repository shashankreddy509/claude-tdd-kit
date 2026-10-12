# Mod build order (from the 2026-10-09 reels)

How to run: open a fresh Claude Code session at the root of this repo, paste `Read <path> and follow it.`, one prompt per session, and merge its PR before starting the next. Exception: Blast Radius is not a kit mod (see item 4).
Each prompt can also be pasted as a Jira ticket body if you later want a board.

Source map: an overview of the reels, kept outside the repo.

## Build these, in order

1. **Ship band**, PDF #07 + reel #10 end card. docs/mod-prompts/ship-band-prompt.md. Depends on: nothing. Size M. Not started (no `receipt.ts` in the kit yet).
2. **Workflow card** (incl. approval card, PR-ready checklist, stage row/grid), reel #10. docs/mod-prompts/workflow-card-prompt.md. Depends on: Ship band (imports `receipt.ts`). Size L.
3. **Agents tracker**, reel #8 + PDF #01. docs/mod-prompts/agents-tracker-prompt.md. DONE: kit PR #34 merged (side-panel 0.2.0).
4. **Blast Radius** (`rm -r` preview + block outside the repo), reel #5. docs/mod-prompts/blast-radius-prompt.md. Built INSIDE the git-guards work, as a settings.json PreToolUse hook, after the shared command parser exists (git-guards ticket 2); not a kit mod. Size M.
5. **Token weather** (forecast in the cache-keeper band), reel #5. docs/mod-prompts/token-weather-prompt.md. Depends on: nothing (extends cache-keeper). Size M.
6. **Project notes card**, PDF #08. docs/mod-prompts/project-notes-card-prompt.md. Storage: a `NOTES.md` file in each repo. Size S.
7. **Tool-call counter** on the spinner, reel #5. docs/mod-prompts/tool-call-counter-prompt.md. Depends on: nothing; cosmetic, build only if you want it. Size S.

## No build

8. **Test-log shrinker**, reel #5. No build: RTK already does it. Its hook rewrites `pytest`, `python -m pytest`, `uv run pytest`, `./gradlew test`, `npx jest`, `npx vitest run`, `npm run test`, `cargo test`, `go test` to filtered `rtk` versions (probed 10-09). Not rewritten: bare `npm test`, `yarn test`, `pnpm test`; `rtk test <cmd>` covers those by hand. The kit's own tests print 39 lines (`claude plugin test mods/side-panel`) and 58 (`tests/validate.sh`), and the pipeline's test-runner agent already returns a diagnosis, not the raw log.
9. **Session hand-off view**, reel #8. No build: zero real cross-session messages in 30 days of transcripts (every `peer` delivery found was a subagent hand-back inside one session, which the Agents card already covers), and Claude Code already draws a peer message as its own labeled row. Revisit if you start running a plan-session plus build-session pair.
10. **Skill rule 4** ("strictness matches how fragile the task is"), reel #7. No build: needs judgment, not a script. Optional later as a prose axis in /skill-improve.

## Already covered (do not rewrite)
- Skill rules 1-3: axis 7 of /skill-improve, done.
- Approval card, PR checklist, step grid: inside the Workflow card prompt.

## Skipped
- Doom above the prompt (cc-arcade): fun, no use.
- "Anthropic is rebuilding Claude Code out of mods": unchecked claim.
- The "10 mods" list behind "comment MODS": comment bait.
