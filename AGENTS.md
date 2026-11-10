# AGENTS.md — PayClock (`payclock-ca`)

Canonical instructions for any agent or person working in this repository. On 2026-11-10 it holds ten planning documents and no application. **Every command named in these documents is proposed until an implementation exists.**

## 1. Reading order

1. [Decision.md](Decision.md): the decision, the competitor finding, clocks and events (section 4), economics, go-to-market, stop rule, sources.
2. [PRD.md](PRD.md): must-haves `MH-01` to `MH-13`, roles, metrics.
3. [App-flow.md](App-flow.md) and [design.md](design.md): screens `S-01` to `S-16`, states, design decisions `DD-nn`.
4. [TRD.md](TRD.md) and [schema.md](schema.md): architecture `AD-nn`, APIs, data.
5. [execution-plan.md](execution-plan.md): tasks `T-p.m.t`, tests.
6. [verification-report-fixing.md](verification-report-fixing.md): what is checked, risks `R-01` to `R-22`, findings, outstanding items.

## 2. Sources of truth

| Topic | File |
|---|---|
| What starts each clock, day counts, which clock is due (CLK-17), rule versions, lawyer-required points (L-01 to L-11), legal questions LQ-01 to LQ-03 | Decision.md sections 4 and 6 |
| Label legend and source table | Decision.md sections 0 and 13 |
| Requirements and metrics | PRD.md |
| Screens and routes | App-flow.md |
| Stack, APIs, jobs, threat model | TRD.md |
| Tables, permissions, retention | schema.md |
| Tasks, estimates, tests | execution-plan.md |
| Risks, findings, traceability | verification-report-fixing.md |

If two files disagree, the file in this table wins and the other is corrected in the same change. The statute outranks every file: if a document disagrees with the Construction Act as consolidated on e-Laws, stop and raise it.

## 3. Product boundaries

- Ontario only; the unpaid subcontractor's side only.
- Dates and templates, not legal advice. PayClock never prepares or registers lien documents or a notice of adjudication, and never sends anything to a contractor, owner, court or registry.
- Non-goals are listed in PRD.md section 10. Do not start one without a recorded decision (R-21).
- No Phase 1-6 work before `T-0.3.4` records "build". No outreach before LQ-01 and no customer report before LQ-02 are answered in writing.
- Hand-run work follows controls HR-1 to HR-6 in execution-plan.md section 3.1; the Checker recomputes every date.

## 4. Architecture conventions

- Layout (proposed): `apps/web`, `apps/worker`, `packages/rules`, `packages/domain`, `packages/db`, `packages/platform`, `packages/templates`.
- `packages/rules` is pure: no I/O, no clock, no network, no imports from other packages. All date and interest arithmetic lives there and nowhere else.
- Rules are data per version. A change in law is a new `rule_version` with a new sign-off; an approved version is never edited.
- Facts are append-only events. Deadlines are recomputed, never edited. A correction and its recomputation commit together.
- Unknown is a valid value. Never add a default date, a required date field, or a fallback that turns unknown into a date.
- A flag never counts as a pass and never stops another clock from computing.
- Event types are distinct and never substituted for one another. Overdue and interest derive only from CLK-17.
- Output that depends on an open legal question is withheld, in code and in fixtures.
- Rule versions are drafted by one person and approved by another.
- Civil dates and integer cents only. No AI in any date, money, access or applicability decision; no AI at all in the MVP.

## 5. Reuse

Before adding a helper, search `packages/platform` and `packages/rules`. Configuration, logging, correlation, queue access, storage keys and mail live once in `packages/platform`; apps must not copy them. Import packages by entry point only.

## 6. Tenant safety

Every tenant table has `tenant_id` and row-level security. Open database connections only through the tenant-scoped client. Jobs carry the tenant and refuse to run without it. Storage keys and any cache key include the tenant. Cross-tenant requests return 404. New endpoints need a cross-tenant test (`IT-01` pattern).

## 7. Migrations

One linear, timestamped history. Expand, deploy, contract. Indexes on populated tables are created concurrently. Backfills are separate, resumable and re-runnable. The ORM schema must match the migrated database exactly (parity check). Never edit an applied migration.

## 8. Tests

- Any rule change needs golden cases checked against the lawyer-signed table (`UT-12`).
- Any change to events, deadlines, reminders or actions needs the staleness tests (`IT-03` to `IT-08`).
- Synthetic data only: Northline Electric Ltd., Baycrest Mechanical Inc., Harbourgate Builders Inc. No real firm, invoice or person in fixtures, logs or examples.

## 9. When something changes, update

| Change | Update |
|---|---|
| Requirement | PRD.md; the traceability matrix; the affected task and test in execution-plan.md |
| Screen or route | App-flow.md; design.md if its look or accessibility changes; the matrix |
| Role or permission | PRD.md section 6; schema.md section 5; TRD.md section 8.2; `IT-01`, `IT-02` |
| Table, index or constraint | schema.md (dictionary, index table, migrations note); TRD.md if an API changes |
| Clock, day count, event, rule version | Decision.md section 4 first; then PRD acceptance criteria, unit tests, and a new lawyer sign-off |
| Price, funnel rate, cost, stop rule | Decision.md sections 7 to 10 together, with the arithmetic re-run |
| Competitor fact | Decision.md section 3 and the source table, with the date consulted |
| Operating assumption (hosting, provider, retention) | TRD.md; schema.md section 8; the risk register if a risk changes |
| Risk | verification-report-fixing.md section 5 only |

## 10. Git hygiene

Default branch `main`. Branches `feat/<task-id>-short-name` or `fix/<finding-id>-short-name`, short-lived, deleted after merge. No credentials, tokens, customer data or lawyer memos in the repository; record a memo by hash only. Do not rewrite shared history. The final remote commit identifier is kept in the coordination ledger, not here.

## 11. Reporting completion

State what was done, what was verified and how, and what was not. "Planned" is not "implemented"; "implemented" is not "tested"; a planned control is not compliance with ASVS or WCAG. Mark application checks `Not run` until they have run. If a source could not be opened, say so. Reviewer findings (`F-nnn`) are closed only by the reviewer's retest.
