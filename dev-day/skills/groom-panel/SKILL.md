---
name: groom-panel
description: Groom a RAW IDEA into a build-ready ticket set by running a four-role panel — a business analyst who interrogates the requirements with the user and then convenes a UI designer, a developer and a tester in parallel on one brief. The BA synthesizes the four views into a groomed package with disagreements surfaced, not smoothed, puts each answerable hard objection back to the one specialist who can answer it over at most two resolution rounds, and carries whatever survives to the user as the decisions only they can make. Runs BEFORE any plan or code; writes ONE markdown artifact (plus one platform-styled mock HTML when a ticket adds a new screen, or a review of the user's existing mocks, approved by the user at a design gate), creates the Epic and — after an approval gate — its child tickets in Jira, but touches no code and no other repo state. Distinct from `/groom`, which analyzes ONE EXISTING Jira ticket for estimation readiness — this one turns "I want to build X" into the tickets themselves. Use on "/groom-panel <idea>", "groom this idea", "run a grooming session", "get the panel on this".
allowed-tools: Read, Grep, Glob, Bash, Agent, AskUserQuestion, Write, ToolSearch, createJiraIssue, searchJiraIssuesUsingJql
arguments:
  - name: idea
    description: The raw idea, feature, or product to groom (free text)
    required: false
---

# Groom panel — four roles on one idea

The user invoked `/groom-panel` with: **`{{args}}`**

One job: turn a raw idea into a groomed ticket set that the existing plan step can consume.
Orchestration bucket. It writes exactly one markdown artifact, and files the groomed set into Jira (one Epic up front, children after an approval gate); it still touches no
code and no git. It runs BEFORE the plan gate, so nothing here needs code approval.

Not to be confused with `/groom`, which reads one existing Jira ticket and judges whether it is
ready to estimate. This skill produces the tickets in the first place.

## Why four roles and not one strong pass

A single analysis anchors on whoever wrote it. Four independent roles reading the same brief
disagree, and the disagreements are the value: a UI need that breaks a test strategy, a data model
the designer assumed and the developer did not. Surfacing those before a plan is written is cheaper
than discovering them in review. The BA never resolves a real conflict by picking a side — it
carries the conflict to the user as a decision.

## The panel

| Role | Reads the brief for | Never does |
|---|---|---|
| **Business analyst** (lead) | What the user actually wants, what is in and out, what success means | Design the UI, choose a library, write tests |
| **UI designer** | Screens, states, flows, what the user sees when things go wrong | Decide scope, pick an architecture |
| **Developer** | Feasibility, what it touches, the shape of the work, the risky parts | Expand scope, design the UI, write code |
| **Tester** | What could break, what is unverifiable, what needs a device or real data | Propose implementations |

## Steps

### 0. Resolve each role's prompt — file first, inlined summary as fallback

Before spawning anyone, resolve the prompt for each of the four roles (`ba`, `dev`, `ui`,
`tester`): look for `docs/business/<role>.md` in the invoking project's **cwd**. If the file
exists, its body is that role's prompt for this run. If `docs/business/` is absent, or a
given role's file is missing, fall back to that role's inlined summary in this skill (the BA
brief-writing/synthesis/resolution instructions in steps 1-5, or the bullet in "Role prompts,
in brief" below).

"The invoking project" means wherever `/groom-panel` is run FROM, not any fixed repo.
Running it from a different directory than the one you meant to groom for will pick up that
directory's `docs/business/` (or none at all) — this is expected, not a bug; state which
source you resolved for each role when you present the result.

### 1. BA interrogates the idea — with the user, not around them

If `{{args}}` is empty, ask what they want to build. Then read the idea and find what is genuinely
ambiguous: what changes the work materially depending on the answer.

If the input carries a `## Decided ...` section (a `/shape-idea` prompt, or an older hand-written
one), every point in it is settled: never re-ask it. Ask only from its "Hard questions" list and
anything neither section covers.

Ask the user those questions with `AskUserQuestion` — **at most four, in ONE call**. Routine calls
are yours to make: state the assumption and move on. This is the only point in the whole skill
where the user is interrupted before the final presentation.

Rules that make this step useful rather than an interrogation:
- Never ask what the codebase can answer. Check first.
- Never ask a question whose answers would lead to the same work.
- If the project has a design doc, CLAUDE.md, or existing tickets, read them before asking anything.
- One short noun phrase in the idea usually hides a scope question ("a dashboard" — for whom,
  showing what, replacing what). That IS worth asking; it is the single most common source of
  rework.

### 1.5. BA creates the Epic

Once interrogation with the user converges (step 1 is settled, no more open questions), the BA
proposes an Epic title + description. The MAIN THREAD — not the BA sub-agent, which holds no
Jira tools — first resolves the Jira project and MCP dialect exactly as `/create-ticket` steps 1
and 1b do (the project CLAUDE.md `Jira:` line, else ask; never hardcode a tool name or site),
then creates it via the create-issue verb (`issueTypeName: Epic`), and writes
`Parent epic: <KEY>` into the artifact header once step 6 produces it.

**The gate at step 8 guards CHILDREN ONLY.** The Epic is created here, before the gate, because
its scope does not change once interrogation converges — this is deliberate, not a bug.

### 2. BA writes the brief

If step 0 resolved a file body for the BA (`docs/business/ba.md`), that body governs the BA's
behaviour across every step it participates in — 1, 2, 4, and 5 — not just this one; treat it
as the BA's standing instructions for the whole run, falling back to this skill's inlined BA
steps only where the file is silent or absent.

A tight document, in the scratchpad, that the three specialists all read. It must contain:
- **The idea**, restated in the BA's words, so a misreading surfaces now
- **In scope / out of scope**, explicitly — out of scope is what stops the panel expanding it
- **Constraints already fixed**: stack, existing modules, locked decisions, deadlines
- **What the user answered** in step 1, verbatim
- **Assumptions taken**, as an overturnable list

The brief is the ONLY thing the specialists see. If it is vague, three agents will each invent a
different product.

### 3. Convene the panel — three agents, parallel, one message

Spawn UI, developer and tester **in a single message so they run concurrently**. Each gets the
brief verbatim plus its own role prompt. Each returns a structured list; none of them sees the
others' output.

Every specialist prompt MUST end with:

> "Before returning, state explicitly what you VERIFIED (a file read, a command output) vs what you
> INFERRED. Flag any conclusion resting on correlation rather than direct evidence."

Ask each role for the same shape, so the BA can merge them:
- **Findings** — concerns, risks, gaps, each tied to the part of the idea it affects
- **Proposed tickets** — what this role thinks are separate units of work, and why the seams fall there
- **Open questions** — what this role cannot answer alone
- **Hard objections** — anything this role believes would make the thing fail

Use the role's file body from step 0 when one was resolved. When none was resolved (no
`docs/business/`, or that role's file is missing), use its inlined summary below as the
fallback — unchanged from before this skill read from `docs/business/`:

- **UI**: screens and states including empty, loading, error and permission-refused; the flow between
  them; what the user sees when the system cannot do what they asked. Name the screens, and mark each
  one NEW (no UI exists to extend) or CHANGED. Do not choose architecture or scope.
- **Developer**: feasibility against the ACTUAL codebase (read it), what modules and files this
  touches, where the work naturally splits, what is riskiest, what existing code it can reuse. Climb
  the reuse ladder before proposing anything new: an existing component or function called with
  this ticket's data first, the same one extended by a parameter second, new code last. Name each
  reused piece with `file:line` — it becomes the ticket's `Reuse:` line. Do not expand scope or
  write code.
- **Tester**: what could break, what is hard to verify, what needs a real device or real data, what
  acceptance criteria each proposed unit needs, and which parts will end up asserted-not-verified.
  Say explicitly what CANNOT be tested and why.

### 4. BA synthesizes

Merge the three into one ticket set. The BA's job here is judgment, not stenography:
- **Reconcile the seams.** The three roles will split the work differently. Pick the split that
  makes each ticket independently reviewable, and say why.
- **Attach concerns to tickets.** A finding that floats free gets lost; a finding on a ticket gets
  read when that ticket is planned.
- **Surface disagreements, never average them.** If the developer says a thing is cheap and the
  tester says it is unverifiable, both statements go in the document, attributed. Smoothing that
  into a middle position destroys the reason for running a panel.
- **Separate decisions from findings.** Anything that needs the user's judgment — scope, priority,
  a trade-off between two defensible options — goes in its own section with a recommendation.

### 5. Resolution rounds — put each objection back to the role that can answer it

A hard objection raised in step 3 was never heard by the specialist who could settle it; the panel
ran once and the roles never saw each other. Before writing anything, the BA closes the ones that
are answerable:

- **Find the clashes.** Scan the merged findings for a hard objection from one role that another
  role is the one who can answer — the tester calls a flow unverifiable, the UI role assumed a data
  model the developer did not, a dependency the developer called cheap that nobody has checked.
- **Spawn ONLY the answering specialist.** One clash, one role — the one whose seat the question
  belongs to. Do not re-run the panel, and do not send the objection to a role that cannot resolve
  it.
- **Quote the objection verbatim.** The answering role gets the raising role's words unedited, not
  the BA's paraphrase, plus the brief it already read. Paraphrase is where the question softens.
- **One parallel message.** All the clashes of a round go out together, the same fan-out mechanism
  as step 3, so the round costs one wall-clock wait rather than several.
- **AT MOST TWO ROUNDS. HARD CAP: 2.** Read the answers, drop the clashes they close, and repeat
  once with what is left. After the second round, stop — there is no third round, whatever the
  answers look like.
- **Escalate the survivors.** A clash still standing after the cap is a decision, not a failure. It
  goes to the user exactly as it does today, both positions attributed.

The roles still never see each other: every round is fan-out from the BA, never a conversation
between specialists.

The step 4 rule binds here with the same force. **A round exists to answer an objection, not to
negotiate one away.** Ask the specialist to answer the objection on the evidence, not to find
common ground with the role that raised it. If the answer concedes nothing, the clash is unresolved
and stays unresolved — a round that produces agreement by softening both sides has destroyed the
same value that averaging destroys.

Every round prompt MUST end with the step 3 contract:

> "Before returning, state explicitly what you VERIFIED (a file read, a command output) vs what you
> INFERRED. Flag any conclusion resting on correlation rather than direct evidence."

### 6. Write ONE artifact

`tasks/groom/<slug>-grooming.md` in the current project (create the directory if needed). If there
is no obvious project, write it to the scratchpad and say so.

Structure:

```
# <Idea> — groomed

Parent epic: <KEY>

## Role sources
<one line per role — ba/ui/dev/tester — "file: docs/business/<role>.md" or "inlined fallback">

## What this is
<BA's restatement, in plain words>

## Scope
### In
### Out, and why

## Tickets
### <ID or short name> — <title>
**What:** ...
**Acceptance criteria:** ... (from the tester)
**Touches:** ... (from the developer)
**Reuse:** `Symbol` @ `file:line` — call with <data> | none found (from the developer)
**Screens/states:** ... (from the UI role, where it applies)
**Design:** <mock path, picked direction, approved date> | NOT APPROVED (new screens only, from step 7.5)
**Concerns raised:** ... (attributed: "Tester: ...", "Dev: ...")

## Where the panel disagreed
**Resolution rounds run: <0, 1 or 2>**

### Resolved
<each clash the answering role closed, with which role answered and what settled it>

### Still unresolved
<each conflict, both positions, attributed, unresolved>

## Decisions for <user>
<numbered, each with a recommendation and what it changes>

## Assumptions taken
<overturnable list>

## What the panel could NOT determine
<explicitly; including anything needing a device, real data, or an external answer>
```

### 7. Present it

Lead with the answer: how many tickets, where the seams fall, and the single biggest disagreement.
Then the decisions the user has to make. Keep it short — the document holds the detail, the message
points at what needs their judgment.

Do NOT write a plan, and do NOT write code. Grooming ends here; the plan step comes next, and it
has its own approval gate.

### 7.5 Design gate (new screens only)

Runs only when a ticket adds a screen the UI role marked NEW; a change to an existing screen skips it.
Approving the ticket package in step 8 is NOT approving a design: a text layout is not a design, and
the user must see the look before anyone builds it.

1. **Resolve the platform** of each NEW screen from the repo: `AndroidManifest.xml` / Gradle app
   module → Android; an Xcode project with an iOS target → iOS; a macOS target → Mac; otherwise web.
   A multiplatform repo or no code yet → ask the user which platforms. Never default a mobile or
   desktop app to a web page.
2. **Ask whether mocks already exist** (`AskUserQuestion`: "I have mocks" + path / "make them").
   Accept PNG, JPG, PDF or HTML. A design-tool link needs an export to one of those unless a
   connector for that tool is available.
3. **Existing mocks → review, do not redraw.** Read every file and check, per ticket: every screen
   the UI role listed is present; every state (empty, loading, error, permission-refused) is shown;
   no control, route or feature outside the ticket's scope; the flow between screens matches; the
   look follows the platform from 1 (no iOS controls in an Android app). Report "matches" or
   "gaps: ..." per ticket. The review finds gaps; it never approves on its own.
4. **No mocks → draw them.** Write 2-3 visual directions to `docs/mocks/<epic-slug>.html` in the
   invoking repo: one self-contained file, sample data labeled as sample, the same content in every
   direction, and a States section covering every state the UI role listed. Every control must be
   in the ticket's scope; invent no commands, routes or buttons. Render in the platform from 1, at
   device size: Android → phone frame ~412x915 with Material 3 components; iOS → iPhone frame
   ~390x844 with iOS (HIG) components; Mac → a window with title bar and sidebar; web → page.
   Multiplatform → the platforms side by side.
5. Screenshot each direction or reviewed screen (a headless browser, viewport at the device size
   from 4) and look at it before showing the user; fix overflow or a broken script first. A page
   that renders blank is not a mock.
6. Ask with `AskUserQuestion`: approve (pick a direction, or the reviewed mocks) / approve with
   known gaps / revise / defer. An approval goes into the artifact under `## Design approval`
   (path, direction, date, gaps accepted), into that ticket's **Design:** line, and into its
   acceptance criteria ("built to match the approved mock, direction X"). Accepted gaps are listed
   in the ticket description so the build does not invent the missing states.
7. Defer still files the ticket, with `**Design:** NOT APPROVED, needs mock sign-off before build` at
   the top of its description.

### 8. The approval gate

Offer the presented package to the user with `AskUserQuestion`: approve / revise / stop.

- **Approve** — proceed to step 9, file the children.
- **Revise** — loop back into resolution (the step 5 mechanism, same two-round cap); re-present
  and gate again.
- **Stop** — end the run. No children are filed. The Epic created in step 1.5 is left as an
  orphan — a known, accepted cost, cheap to clean up manually.

### 9. File the children

For each `### ` unit in the artifact's `## Tickets` section, create a child issue
(`issuetype: Task`, `subtask: false`, `parent: <Epic key>` — not a subtask; the MCP schema's
"Parent for subtasks" description is narrower than its actual behaviour) with a description
assembled from that unit's What / Acceptance / Touches / Reuse / Concerns and any preserved unrecognized
fields — do not drop them.

Blocked units (flagged in their `### ` heading) get filed too, with the blocked status surfaced
prominently in the title or the top of the description — never skipped, never filed as ordinary
work.

Before filing each unit, check for an existing child with the same title under this Epic
(`searchJiraIssuesUsingJql`, or read the Epic's children directly) — an exact title match is
reported as "already exists" and skipped, not re-created.

Report the filed keys and their URLs (`https://<site>.atlassian.net/browse/<KEY>`, the site the
step 1.5 resolution found) to the user at the end.

## Boundaries

- Read-only on the repo. One markdown file written, plus `docs/mocks/<epic-slug>.html` when step 7.5
  draws mocks; nothing else.
- Creates the Epic (step 1.5) and, after approval, its children (step 9) — and nothing beyond
  that: never edits or deletes an existing ticket, never touches git.
- Never relays a specialist's verdict as established fact. If a role asserts something load-bearing,
  the BA verifies it against the source before it enters the document, or marks it unverified.
- If the idea is genuinely trivial — one obvious change, one file — say so and skip the panel.
  Four agents on a typo is the failure mode this skill should refuse.

## Gotchas

- Before running the panel to PROVE a change to this skill, get a real idea from the user — a
  manufactured clash proves nothing, and "I don't have an idea to groom" is a legitimate answer that
  means park the prover, not invent one.
- A round that produces AGREEMENT deserves more suspicion than one that produces a retraction; the
  answering seat withdrawing its own earlier claim is the signal the round did real work.
- Report the round count AND whether the cap was exercised. One round that closes everything proves
  the mechanism, never the limit — say which half went unwitnessed rather than reporting a flat PASS.
- Check the brief's own facts before handing it to the specialists; a wrong premise in the brief
  propagates to every seat at once, and they will each spend a tool call disproving it.
- A clash only one seat can answer goes to that seat alone, not to the panel — but a clash NO seat
  can answer (a disagreement with the user's own ruling) is an escalation, not a round.
- The role files' frontmatter can carry `description: >` (a folded YAML block scalar). A naive
  parser that reads the raw line stores the literal two-character string `">"` as the value, not
  the indented prose beneath it — and that literal `">"` is truthy, so a bare `if description:`
  presence check passes while capturing nothing. This skill never parses the frontmatter at all
  (step 0 reads the file BODY as the prompt, ignoring the frontmatter block entirely), so this
  trap does not bite here — noted for anyone tempted to add frontmatter parsing later.
- Check the brief's OWN assumptions against the codebase before handing it to the panel — one brief asserted a settings store was net-new when a settings module had existed for days with 18 tests, and two seats each spent a tool call disproving it. A wrong premise propagates to every seat at once.
- A seat contradicting the USER's ruling is a signal to re-measure, not to relay. When the dev seat said a feature had no channel against an owner ruling that it did, both were partly right: the reference implementation used a PROMPT CONVENTION plus a file, not a hook. Find the third answer before escalating a false either/or.
- To PROVE this skill reads the role FILES rather than its inlined fallbacks, plant a distinguishing marker in one role file's body (a nonsense token plus an instruction to lead the report with it), and verify before the run that the token appears in the file and NOWHERE in this SKILL.md. A run that merely succeeds proves nothing — the inlined prompts already produce good artifacts. Pair it with a second run from a directory that has no `docs/business/`, asserting the fallback still convenes the role and does not go hunting in another repo for a substitute file. Restore the edited file afterwards and confirm byte-identical.
- A UI seat's written layout is not a design. One new dashboard page reached the build with only a text spec and no design sign-off; any NEW screen goes through step 7.5 before its ticket counts as groomed.
