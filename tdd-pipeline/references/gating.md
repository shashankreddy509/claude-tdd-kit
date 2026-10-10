# Feature-flag gating (OPTIONAL)

Applies only when the project CLAUDE.md has a `Gating:` line naming its feature-flag store
(a Firestore doc, LaunchDarkly/Unleash, a `feature_flags` table, an env default, or anything
else it already uses) and the line is not `off`. Absent or `off` → skip every gating step in
every stage; a pre-v1 project has no users to protect.

## Plan time (`build`, step 1.5)

Decide which side the ticket needs:
- server work feeding a client surface → **both sides**
- server-only → **server flag**
- client reads the data store directly, no server → **client flag only**
- refactor/tooling/docs, nothing user-facing → **neither**

Fold the "does this need gating" call into the approval `AskUserQuestion` when it is
genuinely ambiguous — don't guess silently.

A flag has two sides: the **server flag** (off ⇒ the server stops sending the data) and the
**client flag** (off ⇒ the app stops rendering the surface). Either alone starves the
feature. Both **fail closed: absent means OFF** — a surface renders only on an affirmative
`true`, and a kill writes `false` rather than deleting the key.

Key names, identical on both sides (example convention; follow the project's own if it has
one): `feat_<name>` (long-lived) or `fix_<TICKET>_<slug>` (short-lived rollback lever,
retired ~2 weeks after it ships stable).

The plan carries this section, with the exact keys, the screen the catalog check wraps, and
a gate-off test case per side:

```
## Gating
- Name: `feat_<name>` or `fix_<TICKET>_<slug>`. Same name on both sides.
- Server flag: `<key in the project's flag store>` — off ⇒ [what the server stops sending]
- Client flag: `<key in the project's flag store>` — off ⇒ [which screen/component/endpoint
  stops rendering or responding]
- Gate-off tests: [server-off case] · [client-off case] · [absent key ⇒ OFF]
```

## Seeding (`build-coordinator`, Stage 1.6, after verify-red and before implementation)

Do this YOURSELF via Bash; do not delegate it. For each key the plan names:
- Write it to the project's feature-flag store at `false`, using the project's own flag
  helper/CLI. Where the store keeps flags as fields on one shared document, merge-update that
  document — never create a document per entry and never overwrite the whole thing.
- **Read it back** and confirm the value is present and `false`. A write you did not read
  back is not a seeded key.
- Already exists → leave its current value alone (never stomp a live flag someone flipped)
  and record that it pre-existed.
- The project has NO flag store configured → record `gating` as n/a in the receipt, skip
  this stage, and continue. A missing store is not a failure.
- A CONFIGURED store cannot be reached, or readback fails → STOP: "❌ Pipeline stopped at
  Stage 1.6: could not seed/verify <key>." Do not let the implementer write gated code
  against a gate that may not exist.
- Seeding writes to a REAL store: resolve which environment before writing, and if the plan
  says dev-ON/prod-OFF, seed dev and never touch prod. Asserting on the DB client proves
  which project you reached, not that you were meant to reach it. A prod write nobody
  authorised is a hot-zone change even when the value is `false` and no code reads the key yet.

Record keys + readback in the receipt's `gating` block (`required`, `seeded`, `readback`).
Output: "🔒 Seeded <keys> = false".

## Implementation (`implementer` rule, passed by the coordinator)

The feature reads its gate through the project's ONE shared flag client with a fail-closed
default (absent ⇒ off), never an ad-hoc flag read at the call site. If no such client
exists, build a minimal one over the project's EXISTING flag mechanism — never introduce a
new flag backend.

## Tests (`test-writer`)

The plan's gate-off cases are REQUIRED tests, not optional ones: server side, flag off ⇒ the
documented 404 / omitted field; client side, flag off ⇒ the surface is not rendered. Also
cover the absent-key case: a missing flag entry behaves as OFF. An untested off-path is
discovered during the incident it was built for.

## Ship check (`ship`, receipt gate)

The receipt's `gating` block is omitted when the project has no gating or the ticket needs
none. Present ⇒ `seeded` must cover every `required` key and `readback` must be `"ok"`;
otherwise STOP — the kill-switch does not exist, and the feature could not be turned off
after release.
