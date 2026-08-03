---
name: condense-feedback
description: Condense a grown feedback/memory file in place — shrink it ~75-85% WITHOUT losing any distinct lesson. Merges points that mean the same thing, groups by theme, keeps every unique rule, concrete constant, and cross-reference. Use when the file has grown unwieldy, when the user says "feedback file is too big" / "shrink it but keep all the content", or on /condense-feedback. Backs up the original first.
arguments: "[file-path]"
---

# condense-feedback

Shrink a grown feedback or memory file **in place**. Lossless-by-meaning: every distinct
lesson survives, only the repetition dies.

This is the counterpart to `merge-feedback`. That skill only ever GROWS a file (append a
dated section, never delete, superset-checked). This one is the only thing allowed to
shrink it — deliberately separate, because deciding "these two bullets are the same
lesson" is a judgment call that can silently lose something, so it is gated behind an
explicit invocation and a backup.

**Argument:** a path to the file. No argument → default to `tasks/feedback.md` in the
current repo (what `merge-feedback` writes). If that does not exist, ASK which file rather
than guessing — this skill rewrites files, and a wrong target is destructive.

## When to use
- The file has many near-duplicate entries on the same theme after a long run of sessions.
- The user says "too big", "minimize it but keep all the content", "compress this memory file".
- A memory index is approaching a read limit and needs to fit.

**NOT for summarization.** This is lossless-by-meaning compression. A future session must be
able to avoid every mistake the original file recorded.

## Core rule

**Preserve every distinct lesson; only repetition dies.** Merge points that mean the same
thing, drop the narrative retelling, but never delete a unique rule, a unique gotcha, a
concrete constant, or a cross-reference.

The test for a merge: two bullets merge **only if a future session would take the same
action from either one**. Similar wording is not the same lesson — "verify a merge from the
API" and "verify a deploy by hashing the served bytes" look alike and are different rules.
When unsure, keep both. A file that is 5% larger than ideal costs nothing; a dropped lesson
costs the mistake it was written to prevent.

## Steps

### 1. Resolve `SKILL_DIR`, then back up and measure FIRST

Set `SKILL_DIR` to the **absolute path of the directory containing THIS SKILL.md you just
Read** — your harness reported that path in the Read result. The script is always a direct
sibling of this file, in every install layout:

```
Read ~/.claude/plugins/cache/<marketplace>/dev-day/<ver>/skills/condense-feedback/SKILL.md
  → SKILL_DIR=…/skills/condense-feedback
Read ~/.claude/skills/condense-feedback/SKILL.md
  → SKILL_DIR=~/.claude/skills/condense-feedback
```

Substitute that literal path. This works on every harness without relying on a
harness-specific environment variable.

```bash
"${SKILL_DIR}/scripts/backup-and-measure.sh" <file>
```

It refuses if the file is missing, writes a TIMESTAMPED backup (`<file>.bak-YYYYMMDD-HHMMSS`)
it will never overwrite, and prints the ORIGINAL line + char counts for the final comparison.
The script only backs up and measures — **you** do the condensing.

If the file is ITSELF already condensed (it carries the header note from step 5), say so
before proceeding: you may be shrinking a derivative, so confirm a full-prose original still
exists in a backup.

### 2. Read the WHOLE file

Page through with offset/limit if it exceeds the read cap — grown feedback files usually do.
You cannot condense what you have not fully read. Note the structure: dated blocks, numbered
entries, `**Why:**` / `**How to apply:**` sub-fields, or plain bullets under headings.

### 3. Cluster by THEME, derived from the content

Do NOT impose a fixed theme list — read what is actually in the file and let the themes fall
out of it. A backend project's feedback clusters differently from a mobile or data project's.

Aim for 6-12 themes. Too few and unrelated lessons collide; too many and it stops being a
condensation. Typical shapes, as illustration only — use the file's real vocabulary:
communication and working style · verification and ground truth · the project's own domain
logic · its stack and tooling · git, review, and release · infra and CI · process meta.

### 4. Distill each entry to ONE tight line under its theme

- Keep the actionable rule plus the decisive *why* (the root cause or constraint). Drop the
  story of how it was discovered.
- **Preserve verbatim, always:** every concrete constant, magic number, ID, key, endpoint,
  `file:line`, function name, env-var name, error string, and exact command. These are the
  value of the file — never paraphrase them away.
- **Preserve cross-references.** If the file uses numbered entries, carry the old numbers in
  brackets at the end of the line (e.g. `[97][116][63]`) so `[[N]]`-style links elsewhere
  still resolve; when several entries merge into one line, list ALL their numbers. If the
  file is organized by date instead, keep the date that a merged lesson came from where it
  carries meaning (a dated decision, a version boundary).
- Sentence fragments are fine. Pack sub-items on one line with `·`.

### 5. Add a one-line header note

Under the existing frontmatter, explain: this is a theme-grouped index, old entry numbers are
in brackets, full prose lives in the timestamped `.bak-*` backup, and new learnings should
MERGE into the matching theme rather than append a fresh fat block. **Keep the original YAML
frontmatter byte-identical.**

### 6. Verify the shrink AND the coverage

```bash
"${SKILL_DIR}/scripts/backup-and-measure.sh" --after <file>
```

Prints new counts and the computed % reduction against the backup. Expect ~75-85%.

Then check nothing was lost, which matters more than the percentage:

- Skim every entry heading in the `.bak-*` backup and confirm each maps to a line in the
  condensed file.
- If you are unsure whether a niche gotcha survived, **it did not** — add it back.
- Confirm the frontmatter is unchanged.

A mechanical coverage check, when the file has structured entry markers:

```bash
grep -c '^#\{1,3\} ' <file>.bak-<stamp>   # entry headings before
```

Compare against the theme-line count you produced. A large unexplained gap means lessons were
dropped, not merged.

### 7. Report

Old → new line and byte counts, % saved, the backup path, and "every distinct lesson
preserved, grouped into N themes." Name any judgment call where two entries were merged and a
reader might disagree.

## Notes

- Works on any markdown feedback/memory file. For a file with a structural contract, keep it:
  a todo list keeps its `[ ]` / `[x]` checkboxes; a CLAUDE.md keeps its section headers; an
  index file keeps one line per entry.
- Do NOT commit unless the user asks. This often edits a file outside the repo.
- Each run makes a fresh timestamped backup and refuses to clobber an existing one — a
  never-clobber bug once destroyed a 640-line original, which is why the guard exists.
