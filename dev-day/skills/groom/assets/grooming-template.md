# Grooming brief — <TICKET>

_Pre-grooming readiness + spec brief. Read-only analysis — no implementation plan, no story-point number. Answers "is this ready to estimate, and what will it touch"._

**Ticket:** <TICKET> — <summary>
**Type:** <issuetype> · **Parent epic:** <epic or —> · **Status:** <status>

## 1. Restate the ask

<One paragraph, in your own words: what is actually being requested, so a wrong reading surfaces at grooming — not mid-sprint. State assumptions explicitly.>

## 2. Acceptance-criteria audit

<List each AC VERBATIM (not paraphrased). For each, judge: present? testable (observable pass/fail)? Flag missing / vague / contradictory ACs as blockers to estimate.>

- **AC1 (verbatim):** "<...>" — present ✅ / testable ✅ | ⚠️ vague / ❌ missing — <note>
- ...

**Groom-ready ACs?** <yes / no — a ticket without testable ACs is not groom-ready>

## 3. Business spec

<What user-facing behavior changes, for whom, under what conditions (auth state, trading mode paper/live, flow). Note edge cases the ticket implies but doesn't state.>

## 4. Technical spec — codebase reality

<Anchor the ticket in the REAL code: where the feature lives today, what gates it, which modules a change would touch, the contracts involved. Every file:line must resolve. If net-new with no existing hook, say "net-new; no existing code to anchor to" — do NOT fabricate.>

- **Where it lives today:** <file:line ...>
- **Gate:** <feature_toggles/config.<x> (web) | catalogOn(<flag>) in CatalogFlags.kt (android) | none>
- **Modules a change would touch:** <...>
- **API contracts (inferred vs confirmed):** <new/changed endpoints, request/response shapes — mark each `inferred` or `confirmed`>
- **Test matrix:** <unit (web: pytest | android: ViewModel) + any manual/on-device coverage — so test effort is visible at estimate time>

## 5. Dependency / twin check

<Does real behavior depend on something not yet shipped — a backend change, a Firestore migration, a mobile↔web contract, another ticket? Check links/labels/parent. Flag "blocked on <dependency>" if so.>

## 6. Open questions / gaps to resolve before estimating

<The decisions that must be made first: missing ACs, undecided business rules, unconfirmed contracts, analytics/observability not specified.>

- <...>

## 7. Complexity signal (NOT a point value)

**<Small / Medium / Large>** — <1–2 reasons, grounded in section 4's codebase reality: modules touched, contract changes, test surface, dependency. This informs the estimate; it does not replace it.>

## 8. Inferred vs confirmed

<Everything above marked as inferred (contracts, edge cases) restated here as inferred, not stated as fact.>

## 9. Self-check

`GROOM SELF-CHECK: <PASS | FAIL — misses>`
