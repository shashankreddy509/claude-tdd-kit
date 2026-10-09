**Where this is built: INSIDE the git-guards work, as a settings.json PreToolUse Bash hook, after the git-guards shared command parser exists. Not a kit mod.**

Build Blast Radius: before a Bash `rm -r` / `rm -rf` (globs included) runs, list what it would delete (count + first 10 paths) and stop it when any target sits outside the repo the command runs in. This one is NOT a kit mod: it is a PreToolUse Bash hook in `~/.claude/hooks/` (a private config repo). Build it as part of the git-guards work, branch `feat/blast-radius`, open a PR, the owner merges.

Origin: reel #5 (a public reel), "Blast Radius" mod. Overview: kept outside the repo.

Read first: the git-guards prompt (the shared parser plan, kept in a private repo), `~/.claude/hooks/deploy-merge-gate.js` (`commandSegments()` :53, `invokes()` :67, `deny()` :90), `~/.claude/hooks/shell-idiom-gate.js`, `~/.claude/hooks/tests/test-deploy-merge-gate.js` (real temp dirs), the `~/.claude/settings.json` PreToolUse block, and the notes on the deploy gate and its parity hooks.

## Why a settings hook, not a mod (decided, do not relitigate)
- Every existing command guard (deploy gate, no-AI-attribution, shell-idiom-gate) is a settings.json PreToolUse Bash hook. Secret Guard is a mod only because it needs prompt UI.
- Mods do not run under `claude -p`; headless jobs and routines are where an unattended `rm -rf` hurts most. A settings hook covers them.
- The git-guards plan already owns the Bash command parser (segments, quotes, heredocs, target dir from `cd X &&`). A kit mod could not import it (`claude plugin test` cannot read outside the mod folder), so a mod would duplicate it.

## Overlap with git-guards (name it in the PR)
Git-guards ticket 2 builds ONE shared parser module in `~/.claude/hooks/`. Blast Radius is a consumer of that parser, never a second copy. If that module does not exist yet when you start, STOP: run git-guards ticket 2 first.

## Decided
- Trigger: any segment that invokes `rm` with `-r`, `-R` or `--recursive` (combined flags like `-rf`, `-fr`, `-Rf`), after `sudo`/`command`/env prefixes.
- Resolve each target against the segment's working dir (from the parser), expand `~`, `$HOME` and plain globs yourself. Never run the command or a shell to expand it. A target with `$(`, backticks or another unresolved `$VAR` cannot be previewed: treat it as outside.
- Walk targets with a cap (10,000 entries or 2 s); show "10,000+" past it. Message: `rm would delete 1,284 files in 3 targets: <first 10 paths>`.
- Outside the repo (the target's real path, symlinks resolved, not under the segment's git top level), or `/`, `~`, `..` escapes: deny with the list.
- Inside the repo: allow, with the count added as context so the model sees what it removed.
- Fail CLOSED on a parser error, like the deploy gate.

## Do
1. PROBE first: does a PreToolUse `permissionDecision: "ask"` with a reason still prompt in auto mode, and what does it do under `claude -p`? Record both in the PR body. Use `ask` only if it prompts in auto mode; else deny.
2. Pure logic (`blast-radius.js` exporting `plan(command, cwd)` → `{targets, count, sample, outside}`) with tests on real temp dirs: `rm -rf build`, `cd /tmp/x && rm -rf *`, `rm -rf ~/foo`, `rm -r ../sibling`, a symlink pointing out of the repo, `rm -rf "$DIR"`, `rm file.txt` (no -r, untouched), quoted `rm -rf` inside an `echo` or heredoc (untouched).
3. Register it in settings.json next to the deploy gate (matcher Bash, timeout 10).

## Do NOT
- No second command parser; no copy of `commandSegments()`.
- Do not guard `find -delete`, `git clean`, `xargs rm` in v1 (see Hard questions).
- No personal names or absolute home paths in the code; derive from `$HOME`.

## Hard questions (to the owner)
- Inside the repo, deleting git-TRACKED files: allow silently, or ask?
- Add `find ... -delete`, `git clean -fdx`, `xargs rm` to v1, or later?
- Escape hatch (an env var on the command), or none?

## Done means
- HOT ZONE: before editing settings.json, state what breaks (a buggy PreToolUse Bash hook can block every shell command in every session), who notices, how to reverse (remove the settings entry). Get explicit approval.
- `node ~/.claude/hooks/tests/test-blast-radius.js` passes (pass/fail line pasted), and `test-deploy-merge-gate.js` still passes.
- Mutation check: break the flag match, the outside check and the glob expansion once each; the suite goes red each time.
- One live check in a real session: `rm -rf` on a temp dir outside the repo is denied with the list; owner screenshot of the message.
- No AI attribution in commits or the PR body (hard rule).

> Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output)
> vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.
