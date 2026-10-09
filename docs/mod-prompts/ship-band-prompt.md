Build the Ship band: a one-line row above the prompt that shows, while you work, what `/ship` would refuse right now. Local build, no Jira (mods are not ticketed). Source repo: this repo (public). Put it in the side-panel mod (mods/side-panel), not a new plugin, so the receipt reader can later feed the workflow card too. Branch off main as feat/ship-band; open a PR, the owner merges.

Origin: a public PDF "Claude Code mods worth building" idea #07 + the end card of a public reel.

Read first: tdd-pipeline/commands/ship.md step 0 (the receipt gate table + Staleness), tdd-pipeline/agents/build-coordinator.md receipt section (~72-101, 331), mods/side-panel/hooks/register.tsx + panel.ts + look.ts and their tests, mods/side-panel/types/index.d.ts, and the API types at mods/side-panel/.claude-plugin/types/claude-code/index.d.ts (grep for the AbovePrompt band and the `fs` API). Load the `plugin-authoring` skill before writing hooks. The Next Steps mod (mods/next-steps) already draws an AbovePrompt band: read how it does it.

## What the band shows
One line, only when the session's repo has a pipeline receipt for the current work:
`ST-248 ship · ✓ tests red→green · ✓ review · ⚠ 2 warnings · ✗ receipt stale (2 commits since)`
- Each item is one row of the ship.md step 0 table, in the same order, with the same rule: missing file, `stage != complete` (name the stage), `red.exit == 0`, `green.exit != 0`, `review.critical/must_fix/unverified > 0` (missing = 0), `gating` readback / seeded-vs-required, `review.warnings > 0` (count only on the band; /ship still prints them).
- Staleness exactly as ship.md: `receipt.sha` vs HEAD. Dirty tree with HEAD == sha is the normal case and is NOT flagged.
- All clear: `ST-248 ✓ ready to /ship`.
- No receipt in the repo: draw nothing. No ticket work in progress is a valid state.

## Decided
- Display only. No buttons, no running /ship, never write or touch a receipt.
- The band mirrors ship.md, it does not invent rules. Put one comment on the rule list naming ship.md step 0 as the source, and a test fixture per table row, so a change to ship.md that the band misses shows up as a failing fixture once someone updates it.
- Which receipt: the ticket key in the current branch name if one matches a receipt file; else the most recently modified `tasks/receipts/*.json`. Show the key so a wrong pick is visible.
- Refresh on `turn.complete` and when a Write/Edit/Bash finishes (the register.tsx tool hooks already exist; extend them, no new poller).
- Must sit with the Next Steps band and Cache Keeper without fighting: an AbovePrompt band hook must `yield* next(e)` / wrap `next(e)` and add its row, never replace the stack.

## Do
1. PROBE first: can a mod list a directory and read a file in the session cwd (`$.fs`?), and can it learn HEAD and branch without a shell (read `.git/HEAD` and the ref file, handle packed-refs)? Record the real API in the PR body. If HEAD cannot be read, drop the staleness item and say so.
2. Pure logic in `receipt.ts`: `(receiptJson, head, branch) → items[]`, each `{ok|warn|stop, text}`. Unit-test every ship.md table row, staleness both cases, a malformed receipt (show `✗ receipt unreadable`, never throw), and a missing `review` block.
3. Render: terminal = colored text chips; desktop = Text only (no words inside Svg).
4. Bump side-panel's version; one line in the kit README's side-panel paragraph.

## Do NOT
- No personal paths, names or hosts in shipped files (public kit).
- No second poller, no new pane, no edits to tdd-pipeline.
- Do not duplicate the receipt reader later: the workflow card (reel #10 idea) imports `receipt.ts`.

## Done means
- tsc clean (`npx -p typescript tsc -p mods/side-panel`), `claude plugin validate mods/side-panel`, `claude plugin test mods/side-panel` all pass, summary line pasted.
- Mutation check: flip each rule in `receipt.ts` once; the suite goes red each time.
- `bash tests/validate.sh` passes.
- Owner screenshot of the band in a repo with a real receipt, next to the Next Steps band; until then the PR marks it unverified.
- No AI attribution in commits or the PR body (hard rule).

> Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output)
> vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.
