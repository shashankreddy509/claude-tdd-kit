---
name: prove-pre-existing
description: Prove whether a build, compile, or test failure is caused by YOUR change or was already broken — by stashing your edits, re-running, and comparing. Read-only verdict; fixes nothing. Use when a build/test fails and the question is "is this my fault or pre-existing", or before blaming your diff. Triggers: is this my change, did I break it, pre-existing failure, was it already broken, prove pre-existing, my fault or not, stash and recompile.
allowed-tools: Read, Grep, Glob, Bash
---

# Prove Pre-Existing

One job: attribute a failure. Given a build/compile/test that is currently failing, determine
whether YOUR working-tree change introduced it or whether it was already broken on the clean base.
This is a Verification check on a failure — it does NOT fix the failure, refactor, or change scope.
Output is a verdict with evidence.

## Input

- What's failing and how it's run (the exact command). If unclear, ask for it. Identify the repo of
  the change (usually the cwd, but confirm).
- **Detect the stack** from the command / repo so you read traces correctly:
  - **Python / pytest**: e.g. `.venv/bin/python -m pytest tests/...`. Read the bottom of the
    traceback — the real `E   AssertionError` / `ImportError` line, not the collection noise above it.
  - **Kotlin / Gradle**: e.g. `./gradlew :module:testDebugUnitTest`. Read kapt/Gradle traces
    **bottom-up** — the real `Caused by` / `e:` lines.
  - **Other stacks**: find the real failing line, not the summary. Most runners print the useful
    signature furthest from the invocation.

## Steps

1. **Capture the failure as-is.** Run the failing command and save the exact error signature (the
   real failing line, not the noise around it). Note which files the errors point at.

2. **Confirm what's yours.** `git -C <repo> status --short`. List the files YOU changed. If the
   errors point at files NOT in your change set, that is already strong evidence of pre-existing
   breakage — call it out.

3. **Stash your edits** (scope to your files, keep the rest of the tree intact):
   `git -C <repo> stash push -- <yourfile1> <yourfile2> ...`
   For an untracked new file (e.g. a new test), move it aside instead (`mv` to the scratchpad),
   since stash won't take untracked paths by default.

4. **Re-run the SAME command on the clean base.** Compare the error signature to step 1:
   - **Same errors remain** → the failure is PRE-EXISTING; your change is not the cause. Capture
     the identical signature as proof.
   - **Errors gone** → your change IS implicated; report which of your files, and the specific
     error each introduces.

5. **Restore your edits exactly.** `git -C <repo> stash pop` (and move any scratchpad'd new file
   back). Verify `git status` matches the pre-stash state — your change must be fully restored.
   **This step is not optional and must run even if step 4 errored out.** A stashed tree that is
   never popped looks like the user's work vanished. If the pop conflicts, STOP and surface it with
   the stash ref (`git stash list`) rather than discarding anything.

6. **Verdict.** State plainly: pre-existing or yours, with the matching/differing error signature
   as evidence. If pre-existing, name the owning file/commit (`git log -1 -- <brokenfile>`) so the
   user knows it's not theirs to fix here.

## Notes

- **Kotlin** compiles a whole source set as one unit — a single rotten file fails the set even for
  an unrelated change. This skill only ATTRIBUTES; it doesn't run-past a rotten set.
- **Python** import-time errors (a bad `import` in a sibling module) can fail collection for an
  unrelated test — same attribution logic applies: stash yours, see if the collection error persists.
- Do not "be safe" and run a broader build than the one that failed; reproduce the exact failing
  command on clean base, nothing more.
- Read-only verdict skill. It must leave the tree exactly as it found it. It does not apply fixes —
  if the failure IS yours, report it and stop; the user decides the fix.
