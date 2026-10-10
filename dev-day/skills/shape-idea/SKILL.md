---
name: shape-idea
description: Shape a raw idea into a paste-ready PROMPT through a pushback conversation — inventory what already exists in the target repo, challenge the idea, separate real requests from examples, lock the decisions — then write the prompt to that repo's docs/ folder and the clipboard. Two targets - a `/groom-panel` prompt (Jira Epic + tickets, no code) or a Claude cloud-session prompt (claude.ai/code builds it on GitHub and opens a PR). Runs BEFORE /groom-panel; writes one markdown file, touches no code, no Jira, no git. Use on "/shape-idea <idea>", "turn this idea into a prompt", "make a groom prompt for this", "write a cloud prompt for this".
allowed-tools: Read, Grep, Glob, Bash, Agent, AskUserQuestion, Write, WebSearch, WebFetch, ToolSearch
arguments:
  - name: idea
    description: The raw idea, in the user's own words (free text, may be a long voice dump)
    required: false
---

# Shape idea — conversation in, prompt out

The user invoked `/shape-idea` with: **`{{args}}`**

One job: turn a raw idea into ONE prompt file the user pastes somewhere else. Utility bucket.
The value is the conversation BEFORE the prompt — pushback, what already exists, what is really
being asked — so the prompt's "Decided" section is settled and the next step does not re-ask it.
`/groom-panel` caps its own questions at four in one round; this skill is where the long argument
happens.

## Steps

### 1. Get the idea and the target repo
If `{{args}}` is empty, ask for the idea. Then settle, in one `AskUserQuestion` call if not
already clear from the idea:
- **Target repo** — the repo where the prompt will be RUN (not necessarily the cwd). The prompt
  file goes in THAT repo's `docs/`.
- **Target kind** — `groom` (run `/groom-panel` in that repo: Jira Epic + tickets, no code) or
  `cloud` (paste into a claude.ai/code cloud session: builds on GitHub, opens a PR). Cloud only
  fits GitHub-only work; work bound to the user's machine (local schedulers, daemons, local data)
  and builds that need hosts the cloud cannot reach (e.g. Android Gradle against Google Maven)
  cannot run there — say so and steer to `groom`.

### 2. Inventory what already exists — before any question
Spawn ONE `Explore` agent on the target repo: its CLAUDE.md, handoff/status docs, existing
features, connectors, open Jira epics named in docs, anything in the idea that may already be
built, and the shared components and functions (UI pieces, data writers) the idea could call with
its own data instead of rebuilding. End its prompt with the verified-vs-inferred return contract. Spot-check any "already
exists" / "missing" claim yourself (one grep) before relaying it. Half of a past idea's asks
already existed; this step is what found it.

If the idea names an outside product, tool or model (often misheard in a voice dump), confirm the
exact name with the user, then research it with `WebSearch` in the same step: what it is, how it
plugs in, cost, what data leaves the machine, maturity. Cite the sources in your reply. Never build
questions on a guessed name.

### 3. Push back and question — as many rounds as needed
Numbered pick-one or Yes/No questions via `AskUserQuestion`, up to four per round, rounds until
settled. Each round:
- **Push back** where the idea duplicates something that exists, fights a written rule (the
  target repo's CLAUDE.md, the user's standing rules), or is speculative. One line each.
- **Request or example?** In a long dictated message, confirm which items are asks and which were
  illustrations. Never plan an example.
- **Names** — use only names the user chose. Never invent a nickname for a feature or app.
- **Never ask** what the repo answers, or a question whose answers lead to the same work.
Stop when every remaining open point is one the downstream panel/session is better placed to
answer — those go in the prompt as "Hard questions", not asked here.

### 4. Write the prompt
Slug from the idea: `<target repo>/docs/<slug>-prompt.md` (create `docs/` if absent). Read an
existing file at that path before overwriting it. Match the shape of the kind:

**groom** — first line is the command, then sections in this order:
```
/groom-panel <Title>: <one-line what>

Run this from <repo path> (tickets go to Jira project <KEY>; no Jira configured → say the panel delivers the artifact only). Read <files> first.

## Why
## What already exists (reuse, do not rebuild)
## Decided with the user (do not relitigate)
## V1 scope
## Hard questions the BA must put to the user
## Out of scope (park, do not build)
## Ticket rules
```
Ticket rules always carry: each ticket names its proof (the test or live check), plus any
ticket conventions the user's CLAUDE.md files set (fields, naming).

**cloud** — plain instructions, sections in this order:
```
<Task in one line>. Repo: <owner/repo>, branch off the repo's default branch as <branch>.

## Setup (run first)
git config user.name "<name>"
## Why
## What already exists (reuse, do not rebuild)
## Decided with the user (do not relitigate)
## Do
## Do NOT
## Before you commit (mandatory)
## Done means
```
Fill `<name>` from the user's local `git config user.name` (name only; the prompt may be committed
to a public repo, so never write an email), so cloud commits are authored by the user. The cloud session cannot read the user's local config, so
before-commit always carries: run `<test command>` and paste the pass/fail summary line; any
commit/PR conventions from the user's CLAUDE.md files (e.g. attribution rules), written out in
full; open a PR, never merge. `## Do` always carries: call each piece listed under What already
exists with this task's data, extending it by a parameter rather than copying it.

Both kinds end with this paragraph, verbatim:
> Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output)
> vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.

### 5. Verify, then hand over
Run, and fix before reporting if any fails:
```bash
f=<target repo>/docs/<slug>-prompt.md
for s in "## Why" "## What already exists" "## Decided with the user" "VERIFIED"; do
  grep -qF "$s" "$f" || echo "MISSING: $s"; done
# groom only: head -1 "$f" | grep -q '^/groom-panel ' || echo "MISSING: /groom-panel first line"
# cloud only: grep -qF 'git config user.name' "$f" || echo "MISSING: git identity"
# macOS; elsewhere use xclip/wl-copy/clip, or skip the clipboard and report the path only
pbcopy < "$f" && pbpaste | cmp -s - "$f" && echo CLIPBOARD_OK
```
Report: the file path, `CLIPBOARD_OK` (or "no clipboard tool"), and the one next step —
groom: "open a session in <repo> and paste it (runs `/groom-panel`)";
cloud: "paste into claude.ai/code on <owner/repo>; after the PR opens, check commit authors and
the PR body against the conventions in the prompt (fix with `gh pr edit <n> --body-file`) before
merging".

## Boundaries
- Writes ONE file (the prompt). No code, no Jira, no git, no commit.
- Never runs the prompt itself; the user pastes it.
- Does not replace `/groom-panel`; it feeds it.

## Gotchas
- The prompt runs in ANOTHER repo and session. Every path in it is absolute or repo-relative to
  the target, never to the cwd this skill ran in.
- A "Decided" line the user never actually said is a fabricated ruling the panel will obey.
  Only write down what was settled in step 3; unsettled points go under Hard questions.
- Before pushing back on an outside tool's limits (billing, auth, where it runs), read its README
  first; an unverified claim (e.g. "a proxy needs an API key") may be wrong.
- If the user escapes or rejects an `AskUserQuestion` dialog, re-ask those same questions as
  numbered plain text in the reply; never drop them or move on as if answered.
- For a build-and-try idea (a mod, a script, a local tool), do not settle its permanent home
  (plugin, kit, repo) before the user has tried it; that is a Hard question for after the test.
- When the target has no Jira AND is not on GitHub (local-only work), neither kind fits: offer a
  local build prompt (Why / What exists / Decided / Do / Do NOT / Hard questions / Done means) instead.
- After writing the prompt, offer to run it in THIS session when context is still small; do not
  default to "open a fresh session".
- When the idea is a big build (new apps, new platforms), give a worth-building verdict with the
  cheaper path BEFORE detail questions.
