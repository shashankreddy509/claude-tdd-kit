---
name: merge-feedback
description: Synthesize this session's preferences/corrections into tasks/feedback.md and merge them into the existing file without ever deleting prior points. One job — the feedback artifact only. Called by end-session and by start-session's mid-session auto-capture; can also run standalone. Triggers: merge feedback, update feedback.md, capture preferences, record corrections.
allowed-tools: Read, Bash
---

# Merge Feedback

One job: take what this session revealed about how the user wants to work and merge it into
`tasks/feedback.md` as a new dated section, preserving everything already there. This is a Utility —
the feedback artifact, every time. It does NOT write session-notes or the memory vault (end-session
owns those and calls this only for the feedback piece).

## Steps

1. **Read the existing `tasks/feedback.md`** if it exists. You must see the current content before
   writing — the merge rule depends on it.

2. **Synthesize this session's observations** into the five sections below. Scan the FULL
   conversation, not just recent turns. Be specific — paraphrase the actual correction/preference,
   not vague generalities. Keep each bullet ≤ 20 words. No code snippets or implementation details —
   behavioral/communication patterns only. (A genuinely technical, non-behavioral gotcha belongs in
   the memory vault, which end-session handles — don't force it into feedback.md.)

3. **Write a new dated section** at the TOP of the file (most recent first), using today's date:

```markdown
# Session Feedback — {YYYY-MM-DD}

## Preferences
- [concise bullet per preference observed]

## Corrections I Made
- [exact correction → what to do instead]

## What Worked Well
- [approaches the user accepted without pushback or praised]

## What to Avoid
- [behaviors the user pushed back on or corrected]

## System Instructions for Future Sessions
- [imperative rule a future session can follow immediately]
- ...
```

## Merge rules (the heart of this skill — never violate)

- The final file MUST be a SUPERSET of the previous version plus what's new this session.
- **NEVER delete an existing point.** Only add or merge.
- If a new observation overlaps an existing point, MERGE them into one combined bullet — do not keep
  both, and do not drop either.
- Collapse within-session duplicates: if the user corrected the same thing twice, one rule covers it.
- Prior dated sections stay intact below the new one. Don't rewrite history; only the new section is
  authored, except where a merge folds a new point into an older bullet.
- If the file has grown unwieldy over many sessions, DON'T hand-trim it here (that risks dropping a
  point) — that's the `condense-feedback` skill's job (shrink-while-preserving-every-lesson). This
  skill only ever adds/merges.

## Self-check (correctness — the superset gate; report PASS/FAIL)

After writing, verify the never-delete rule held. **PASS iff** every bullet that existed in the prior
`tasks/feedback.md` still exists in the new file (verbatim or folded into a merged bullet that
preserves its meaning) — i.e. the new file is a SUPERSET. **FAIL** listing any prior bullet that was
dropped or whose meaning was lost. Practical check: the new file's line/bullet count under each prior
dated section must be >= the old count (a merge that combined two bullets into one is the only
allowed decrease — call it out explicitly when it happens). Report `SUPERSET-CHECK: PASS` or `FAIL —
<dropped bullets>`. A FAIL means restore the dropped points before finishing.

## Notes

- If the date isn't otherwise known, get it from the environment/context — do not invent one.
- This skill writes ONLY `tasks/feedback.md`. If the caller (end-session) also needs
  session-notes/memory updated, that's the caller's job — this stays single-artifact so it can't
  straddle.
- Standalone use = mid-session auto-capture (start-session's rule): when the user gives a correction
  or durable preference, call this immediately so it's on disk before any `/compact`.
