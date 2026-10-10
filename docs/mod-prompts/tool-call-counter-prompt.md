Build the tool-call counter: the spinner line shows how many tools the current turn has called (`Sauteing… 12 tools`). Cosmetic, small. Local build, no Jira. Source repo: this repo (public). It goes in the side-panel mod (mods/side-panel), not a new plugin. Branch off main as feat/tool-counter; open a PR, the owner merges.

Origin: reel #5 (a public reel), "a spinner that counts tool calls". Overview: kept outside the repo.

Read first: mods/side-panel/hooks/register.tsx (the catch-all `on('tool.call', ...)` hook, `prompt.submit`, `turn.complete`), mods/side-panel/types/index.d.ts, look.test.ts mount pattern, and the API types at mods/side-panel/.claude-plugin/types/claude-code/index.d.ts: grep `Spinner: {` (props `word`, `message`, `suffix`, `mode`; "A hook rewrites the first three") and `requestId` ("the agent id for a spinner"). Load the `plugin-authoring` skill before writing hooks.

## Why side-panel owns it
side-panel already hooks every `tool.call`. A new plugin would add a second catch-all tool hook, a manifest and a validate.sh entry for one number. Count inside the existing hook; do not register another catch-all.

## Decided
- Count = tool calls started since the person's last prompt, main loop plus its subagents. Reset on `prompt.submit` from the composer.
- Draw by rewriting the Spinner's `suffix` (keep the engine's ellipsis, append ` 12 tools`). Never replace the whole spinner tree, so elapsed time, tokens and effort stay.
- Zero calls: leave the spinner untouched.
- A `ui.render` Spinner hook must pass through `next(e)` with the rewritten props, so another plugin's rewrite still applies.

## Do
1. PROBE first, with a throwaway hook: does a Spinner `suffix` rewrite draw on the terminal AND in a LOCAL desktop Code session? What is `requestId` on the main spinner vs a subagent's? Does a running subagent draw its own spinner? Record it in the PR body. If the rewrite does not draw, stop and write that up instead of building.
2. If subagents have their own spinners, count per `agentId` and show each spinner its own count; else one total.
3. Pure logic in `counter.ts` (`bump`, `reset`, `suffixText(count, engineSuffix)`) with unit tests; one mount test per surface.
4. Bump side-panel's version; one line in the kit README's side-panel paragraph.

## Do NOT
- No new poller, no new pane, no band, no `$.ui.status` line.
- No personal paths, names or hosts in shipped files (public kit).
- No third-party code or art.

## Hard questions (to the owner after the probe)
- Count the whole turn including subagents, or the main loop only?
- Words: `12 tools`, or a glyph like `⚒12`?

## Done means
- tsc clean (`npx -p typescript tsc -p mods/side-panel`), `claude plugin validate mods/side-panel`, `claude plugin test mods/side-panel` pass, summary line pasted.
- Mutation check: break `bump`, `reset` and the zero case once each; the suite goes red each time.
- `bash tests/validate.sh` passes.
- Owner screenshot of the spinner mid-turn in iTerm and in a LOCAL desktop session; until then the PR marks it unverified.
- No AI attribution in commits or the PR body (hard rule).

> Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output)
> vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.
