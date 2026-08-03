---
name: jira-comment
description: Post a comment on a Jira ticket that renders cleanly despite the Atlassian MCP mangling markdown — strips bold/italic markers, indents code, keeps CC mentions verbatim. Use when the user says "post this on the ticket", "add a comment to PROJ-XXXX", "comment this on Jira", or after authoring an analysis/closure note to share. Triggers: jira comment, post on the ticket, add a comment, comment this on jira, post to jira.
allowed-tools: Read, Bash, ToolSearch
---

# Jira Comment

One job: take comment text the user already has (or just authored) and put it on a Jira ticket so
it RENDERS CLEANLY. The Atlassian MCP converts markdown to ADF and mangles common syntax, so the
real work is making the text render-safe before posting. This skill does NOT write the analysis —
it formats and posts text that already exists.

## Inputs

- The ticket key (e.g. `PROJ-42`). If absent, ask.
- **The Jira cloudId** — discover at runtime from the project `CLAUDE.md`'s
  `Jira: cloudId=<uuid> key=<KEY>` line. NEVER hardcode a cloudId: it is per-site, and a
  wrong one posts to someone else's Jira. A repo whose `CLAUDE.md` has no `Jira:` line has
  no Jira configured — ask the user for the cloudId rather than guessing.
- The comment body. If the user just authored it in the conversation, use that verbatim as the source.
- Any CC mentions — preserve EXACTLY as given (e.g. `User:<accountId>`). These are live
  account-id references; do not reword, reformat, or drop them.

## Render-safe rules (apply BEFORE posting — this is the whole point)

The MCP eats these; rewrite the text so they don't appear:

1. **No `**bold**`** — it leaks as literal `\*\*word\*\*`, and a multi-word bold run becomes a `**`
   between every word. Use a plain label line instead (e.g. `Mechanism:` on its own line), not
   inline bold.
2. **No fenced code blocks** — the ` ``` ` fence is lost. Indent code/data 4 spaces instead so it
   stays monospace-ish and visually grouped.
3. **Underscores in `CONSTANT_NAMES`** still partly escape (`_` reads as italic). It's the one
   residue you can't fully kill via the API — leave the name as-is, and if it matters, tell the
   user to retype that token in the Jira web editor.
4. **No `_italic_`, no `#` headers, no `-` bullet markdown** that relies on rendering. Plain text +
   indentation + blank-line separation only.
5. Inline literals (`Locale.US`, method names) may auto-linkify — harmless, mention only if asked.

Keep the prose, the meaning, and the CC line. Only strip the markup that won't survive.

## Steps

0. **Resolve the Jira MCP dialect first.** Atlassian MCP servers differ per machine: one exposes
   camelCase names (`mcp__atlassian__addCommentToJiraIssue`) with `cloudId` as a REQUIRED parameter;
   another exposes snake_case under a `jira` prefix and resolves the site internally, with no
   `cloudId` at all. If the `tdd-pipeline` plugin is installed, its `references/jira-mcp.md` has the
   full probe procedure — follow it. Otherwise probe inline: try
   `ToolSearch "select:mcp__atlassian__addCommentToJiraIssue"`; if that resolves nothing, search by
   keyword (`ToolSearch "+jira comment"`) and use whatever add-comment verb comes back. Pass
   `cloudId` ONLY if the resolved schema has that parameter — otherwise omit it and ignore the
   `cloudId=` half of the CLAUDE.md line. Never hardcode a tool name.

1. Load the add-comment tool resolved in step 0.
2. Transform the source text per the render-safe rules above. Append the CC mentions verbatim on a
   final `cc <id> <id>` line if provided.
3. Post via the resolved verb: `<add-comment tool>(issueIdOrKey=<KEY>, commentBody=<render-safe text>)`,
   including `cloudId=<discovered>` only when the resolved schema requires it.
4. **Validate the render (objective self-check — report PASS/FAIL).** Re-read the ticket's comments
   (`getJiraIssue`) to get the STORED body, and score it. **PASS iff ALL hold; else FAIL listing each:**
   - Zero literal `\*\*` (escaped bold) in the stored body.
   - No lost code fence — code/data lines are present and grouped (indented), not collapsed to prose.
   - Every CC id from the input appears in the stored body, verbatim.
   Report `RENDER-CHECK: PASS` or `RENDER-CHECK: FAIL — <issues>`. The one expected residue that is
   NOT a FAIL: escaped underscores in a `CONSTANT_NAME` (the MCP can't avoid it) — call it out
   separately with the one-line web-editor fix, but it does not fail the check.

## Notes

- **Confirm the ticket is right before posting** — a Jira comment is outward-facing and notifies
  watchers/CCs. This is the outward-facing action; invoking the skill IS authorization to post THIS
  comment to THIS ticket.
- Personal Atlassian MCP has no edit-comment tool — this skill POSTS a new comment only. To fix a
  posted comment, post a corrected follow-up or edit in the Jira web editor.
- Do not invent or restructure the user's content. If the source has bold that carried real meaning,
  convert it to a label line, don't delete the emphasis silently.
- This is a Utility: one transform + post, every time. It does not gather data, judge quality, or
  chain other skills. (bug-triage / groom can hand their disposition text to this instead of telling
  the user to paste it manually — still gated on the user confirming the post.)
