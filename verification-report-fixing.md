# Verification, findings and fixes — PayClock

Labels and IDs: [Decision.md section 0](Decision.md#0-how-numbers-and-claims-are-labelled). This file is the only home of the production risk register.

## 1. Status summary

| Item | Status on 2026-11-10 |
|---|---|
| Planning documents | Ten files written by Author A |
| Application | B1 foundation and deterministic core built on branch `feat/b1-foundation` (2026-11-11), owner-authorised before the Phase 0 gate; see [section 9](#9-build-milestone-b1-2026-11-11). Checks not listed there stay `Not run` |
| Independent review | Round 1 done: 19 findings (1 blocker, 13 major, 5 minor). Fix round 1 applied; round 2 retest by the independent reviewer: 12 closed, 2 closed with a part open (F-001, F-008), 5 open by design (F-003, F-004, F-009, F-010, F-013), and one minor regression F-020. The author then edited F-001, F-008 and F-020; those edits were checked by the lead and not re-reviewed |
| Legal review | None. No lawyer has seen the rule table, disclaimer or templates |
| Customer evidence | None. No prospect has been contacted |
| Highest-consequence failure | **Late or stale expiry date** ([PRD.md section 9](PRD.md#9-highest-cost-user-mistake)) |

## 2. Checks performed on the documents (author self-check)

Performed with a scratch script outside the repository and by reading; results in the SC log (section 6.1).

| Check | Result |
|---|---|
| Exactly ten required files, no others | Pass |
| Relative links and heading anchors resolve | Pass (SC-01) |
| Every `MH`, `S`, `AD`, `DD`, `T`, `UT`, `IT`, `E2E`, `CLK`, `EV`, `L`, `SRC`, `M`, `R` reference is defined | Pass (SC-02) |
| Every must-have appears in the matrix; 22 risk rows each cite an existing task | Pass (SC-03) |
| Screens, routes, API paths, tables and tasks agree across files | Pass with one correction (SC-04) |
| Economics re-run from stated inputs | Pass (SC-05) |
| Example dates and unit-test dates recomputed, weekdays and holidays checked | Pass (SC-06) |
| Contrast ratios recomputed from hex values | Three figures corrected (SC-07) |
| Primary sources opened as listed in Decision section 13 | Recorded there; one blocked (`SRC-11`); `SRC-14` to `SRC-17` opened in fix round 1 |

## 3. Application checks planned for future implementation

| Check | Tests | Status |
|---|---|---|
| Rule correctness | `UT-01` to `UT-19` | B1: passed except `UT-12` (blocked) and parts of `UT-14`, `UT-16`; section 9 |
| Tenancy and roles, assisted loading | `IT-01`, `IT-02` | B1: `IT-01` partly passed, `IT-02` viewer case only; section 9 |
| Billing and conversion | `IT-15` | Not run |
| Email content and digest record | `IT-16` | Not run |
| Correction, recomputation, staleness | `IT-03` to `IT-08`, `E2E-02` | B1: `IT-03` to `IT-06` passed; `IT-07`, `IT-08`, `E2E-02` not run; section 9 |
| Import | `IT-09` | Not run |
| Migrations | `IT-10` | B1: parity and order parts passed; section 9 |
| Files and links | `IT-11` | Not run |
| Rule governance, logging | `IT-12` | B1: logging part passed; section 9 |
| Deletion and restore | `IT-13`, restore drill `T-5.1.4` | Not run |
| Startup and persistence | `IT-14` | B1: worker-alone and start parts passed; section 9 |
| Pilot promise, navigation, permissions, links | `E2E-01`, `E2E-03` to `E2E-06`, `E2E-09` | Not run |
| Accessibility (WCAG 2.2 AA, manual) | `E2E-07`, `E2E-08` | Not run; no conformance claimed |
| Security review against cited ASVS 5.0.0 requirements | `T-5.1.2` | Not run; no compliance claimed |
| Load and concurrency | `T-5.1.5` | Not run |

## 4. Traceability matrix

| MH | Screen / API | Design or architecture decision | Schema / permission | Task | Planned test |
|---|---|---|---|---|---|
| MH-01 | S-04, S-05, S-06; `POST /invoices`, `POST /imports` | AD-12 | `invoice` unique key, `import_batch`, `import_row` | T-4.1.1, T-4.1.2 | IT-09 |
| MH-02 | S-05, S-08; `POST /events` | DD-02 | `event.certainty` check constraint | T-4.2.1 | UT-07, IT-06, E2E-03 |
| MH-03 | S-05, S-14, S-15; `GET /rules/versions`, `/ops/v1/rule-versions` | AD-03 | `rule_version`, `rule_clock`, `legal_signoff`; `app_rules_admin` | T-0.1.3, T-1.1.1, T-3.1.2, T-4.3.8 | UT-08, IT-12 |
| MH-04 | S-07; `GET /invoices/{id}` | DD-01, AD-11 | `deadline` (`path`), `interest_rate`, `holiday` | T-0.1.2, T-3.1.1, T-3.1.3, T-3.1.6 | UT-01 to UT-07, UT-09, UT-12, UT-17 to UT-19 |
| MH-05 | S-03, S-05, S-07 | DD-03, DD-10 | `deadline.state`, `bound`, `act_by_date`; `event` types EV-17, EV-18, EV-19 | T-3.1.4 | UT-10, UT-11, UT-12, UT-15, UT-16 |
| MH-06 | S-08, S-09, S-12; `POST /events/{id}/corrections`, `GET /recomputations/{id}` | AD-04, DD-05 | `event` supersession, `computation_run`, `deadline.is_current` unique index, `audit_event` | T-2.2.5, T-4.2.2, T-4.2.3 | IT-03, IT-04, IT-05, IT-07, E2E-02 |
| MH-07 | S-03; `GET /invoices?sort=next_act_by`, `GET /digests` | AD-05, AD-10, DD-09 | `reminder` unique (`deadline_id`,`kind`), `digest_send` | T-4.3.1, T-4.3.2, T-4.2.4 | IT-08, IT-16, E2E-01 |
| MH-08 | S-10; `POST /actions`, `.../mark-sent` | AD-07, DD-06 | `action` status check | T-4.3.3 | UT-14, E2E-01 |
| MH-09 | S-02, S-07, S-14 | DD-07, DD-08 | `flag`; `tenant.disclaimer_*` | T-0.1.3, T-1.1.4, T-4.3.5 | UT-07, UT-13, IT-07 |
| MH-10 | S-01, S-13; `POST /support-grants` | AD-02, AD-08 | Row-level security, `membership`, `support_grant.scope` | T-2.2.1, T-2.2.2 | IT-01, IT-02, E2E-05 |
| MH-11 | S-11 | AD-03 | `holdback_entry`, `deadline` | T-3.1.5, T-4.3.4 | UT-11 |
| MH-12 | S-16, S-13; `GET /pilot-report`, `POST /exports`, `DELETE /workspace` | DD-08 | `data_request`, `tenant.pilot_*`, retention table | T-4.3.6, T-6.1.3 | IT-13, E2E-01 |
| MH-13 | S-13; `POST /billing/checkout-session`, `POST /webhooks/stripe` | AD-13 | `tenant.subscription_status`, `billing_event` | T-0.3.3 (by hand), T-4.3.9 | IT-15 |

## 5. Production risk register

Impact is written for this product: a subcontractor relying on dates for money and lien rights. Tests are `Not run` unless a row cites a B1 run (section 9).

| ID | Product impact | Prevention | Detection signal | Test and expected outcome | Task |
|---|---|---|---|---|---|
| R-01 | A delayed batch recompute or reminder job restores a lien date computed before a correction; the owner trusts the later date | In-transaction recompute; fact-version compare-and-set; one-current-deadline unique index; billing events deduplicated and state re-fetched | Nightly invariant job; discarded-run count | IT-05: stale result discarded, one current deadline; IT-15: late "payment failed" changes nothing. B1 2026-11-11: IT-05 passed (`packages/domain/test/isolation.test.ts`); unique current-deadline index in the migration | T-4.2.2 |
| R-02 | A reminder email is accepted by the provider after our timeout and shown as failed, so it is resent or the user is told nothing went out; or an import seems lost and is re-uploaded | Idempotency keys; reconcile sweep by `reminder.id`; "check status" | Reminders in `failed` later found `sent`; duplicate provider ids | IT-08, E2E-09: one email, truthful status | T-4.2.4 |
| R-03 | A second day-counting helper in the web app disagrees with the rules package on holiday extension | All date arithmetic only in `packages/rules`; lint bans date maths elsewhere | Lint failures; golden diff | UT-13 plus lint fixture fails on a stray helper. B1 2026-11-11: UT-13 passed; lint fixture `packages/rules/test/boundaries.test.ts` passed (rules may not import, use a clock or floats) | T-2.1.1 |
| R-04 | The web app imports rule internals and bypasses version selection | Entry-point-only imports enforced | Lint | Lint fixture with a deep import fails. B1 2026-11-11: deep-import lint fixture passed (`packages/rules/test/boundaries.test.ts`) | T-2.1.1 |
| R-05 | Another subcontractor sees a firm's disputed invoices and counterparties through an API, job, export or file link | Three-layer tenancy (TRD 8.2); tenant in job payload and storage key | Row-level-security denials; cross-tenant test in CI | IT-01: 404 everywhere, job refuses. B1 2026-11-11: IT-01 API, use-case and job parts passed (`apps/web/test/api.test.ts`, `packages/domain/test/isolation.test.ts`, `apps/worker/test/worker.test.ts`); export and file link not built | T-2.2.1 |
| R-06 | Worker uses a copied holiday list or config and sends reminders on different dates from the screen | One config and one holiday source in shared packages | Config hash logged by both processes at start | IT-14 compares hashes; IT-12 | T-2.1.5 |
| R-07 | Worker crashes at start because the logger pulls a web-only module; reminders stop silently | Platform package has no web imports; worker start in CI | Readiness check; queue age alert | IT-14: worker healthy alone. B1 2026-11-11: IT-14 worker-alone part passed (`apps/worker/test/worker.test.ts`) | T-2.1.5 |
| R-08 | The one-current-deadline index exists in a migration but not in the ORM and is dropped by a later generated migration, allowing two "current" lien dates | Parity check in CI | `scripts/orm-parity` diff | IT-10: empty diff. B1 2026-11-11: IT-10 parity part passed, empty diff (`packages/db/test/migrations.test.ts`, `scripts/orm-parity.ts`) | T-2.2.3 |
| R-09 | A backfill of `act_by_date` stops halfway; some invoices show no act-by date | Resumable batches with checkpoints; engine tolerates null by recomputing | Checkpoint lag; invariant job | IT-10: interrupted backfill completes on resume | T-2.2.3 |
| R-10 | Two branches add migrations; production applies them in a different order from staging and rule tables diverge | Linear order check | CI failure | IT-10: conflicting branches fail CI. B1 2026-11-11: IT-10 order part passed against fixtures (`packages/db/test/migrations.test.ts`); no CI yet | T-2.2.3 |
| R-11 | Creating an index on `deadline` blocks corrections during business hours | Concurrent index creation, lock timeout | Lock wait metric during deploy | IT-10: writes continue during index build | T-2.2.3 |
| R-12 | A failed reminder cannot be traced to the correction that caused it; or logs expose invoice amounts and general-contractor names | Correlation id through request, job, mail; redaction rules | Log sampling in CI | IT-12: id present end to end; no sensitive values. B1 2026-11-11: IT-12 logging part passed (`apps/web/test/api.test.ts`, `packages/platform/test/platform.test.ts`); job and mail parts not built | T-2.1.5 |
| R-13 | An evidence file overwrites another firm's or another invoice's file | Server-generated keys with tenant, purpose, entity, uuid | Storage audit for keys outside pattern | IT-11: key pattern enforced | T-2.2.4 |
| R-14 | Uploaded aging lists (customer and amount data) remain after 30 days or after deletion | `expires_at` and nightly sweep with alert | Count of expired objects still present | IT-11, IT-13: expired file gone; deletion complete | T-6.1.3 |
| R-15 | Recreating a service wipes uploaded evidence or the database | Managed database and storage; stateless containers; named volume locally | Restore drill; storage object count | IT-14: data intact after recreation | T-2.1.4 |
| R-16 | A deadline email or evidence link points to `localhost` or an internal host and the owner cannot open it on the due day | Links built only from `APP_PUBLIC_URL`; start fails on loopback in production | Link checker | IT-11, E2E-06: host equals public URL | T-2.2.4 |
| R-17 | A developer runs web without the worker; reminders never fire in testing and the defect ships | One start command with health checks | "ready" line lists every service | IT-14. B1 2026-11-11: `make dev-check` printed "ready" with database and queue checks; fails naming the dependency when Postgres is unreachable (section 9) | T-2.1.2 |
| R-18 | After Back or refresh the user re-submits a correction or loses the reason typed; a diff link in an email opens a blank page | URL state, idempotency, form persistence, permanent diff URLs | Client error rate on S-08, S-09 | E2E-04 | T-4.3.7 |
| R-19 | Import silently skips 5 invoices, which then have no deadlines; or a retry doubles invoices and reminders | Per-row results, resume from last committed row, unique invoice key | Batch counts not summing to total | IT-09: 31/4/5, no duplicates | T-4.1.2 |
| R-20 | "Due" is read as the lien last day; a stale menu item leads to a removed page | Clock names with trigger on every date; link checker; glossary | Support questions; crawler | E2E-06; usability pass in T-1.1.3 | T-4.3.7 |
| R-21 | Effort goes to Alberta rules, SMS or QuickBooks sync before Ontario gates pass | Non-goals list; every change maps to an MH or R | Scope audit | T-6.2.3 audit lists zero unmapped changes | T-6.2.3 |
| R-22 | A rule-table fix sits on a forgotten branch while production runs the old count | Branch naming, short-lived branches, weekly prune listing unmerged work | Branch age report | T-6.2.3 report shows no branch older than 14 days unmerged | T-6.2.3 |

None of the 22 is "not applicable". R-15 applies in production only through provider failure, since no container holds state; adding local file storage would raise it.

## 6. Findings register

Reserved for the independent reviewer. IDs `F-001` onward. Authors record fixes; reviewers retest.

| ID | Severity | File | Evidence | Impact | Owner | Fix | Retest result |
|---|---|---|---|---|---|---|---|
| F-001 | blocker | Decision 4.1, 4.2, 4.2.2; schema `event`, `rule_clock` | One event (EV-09) carried termination for both lien and adjudication clocks, dated by Form 8 publication | Adjudication last day shown late | Author A | Sections 13.5 and 31 re-read. Termination split: EV-09 completed or abandoned, EV-17 terminated (actual), EV-18 Form 8 published, as distinct enum values. CLK-11 reads EV-17 and never EV-18. CLK-09 uses EV-18 only if within 7 days after EV-17, else EV-17 with new flag L-11. `UT-15` added (5 days apart, late, and publication-only cases) | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed, part open: EV-17 unknown with EV-18 known gives 'not computable' in Decision 4.2.2 and App-flow S-05 but a provisional 2026-12-15 in UT-15, one day later than EV-18 + 90 allows. Author's later edit: ceiling rule adopted; with EV-17 unknown and EV-18 2026-09-15 the adjudication date reads "no later than 2026-12-14" (90 days counted 15 + 31 + 30 + 14) in Decision 4.2.2, S-05, TRD 5.1, schema and UT-15. Edited after retest; checked by the lead, not re-reviewed. |
| F-002 | major | Decision 4.2.2; PRD MH-05, section 9; UT-16 | Single CLK-09; provisional date not labelled an upper bound; s. 39(4) unused | Late lien date for a sub still on site | Author A | CLK-09 variants a and b with s. 31(4); EV-19 added; provisional dates read "no later than" (`bound`), reminders say "may be earlier"; s. 39(4) publication request added as sixth template; PRD 9 lists the trap; `UT-16` | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-003 | major | Decision 4.3, 4.5; UT-09, UT-10; schema `pending_question` | Extended lien date fixed in example and fixture while L-09 open; CLK-10 base unstated | Open legal question encoded late | Author A | Rights clocks show the un-extended day; extended output withheld until L-09; CLK-10 counts from the un-extended CLK-09 day; example now 2026-11-29, 2027-02-27, 2027-02-15; UT-10 and UT-09 mark the dependent part pending and assert it is withheld. **Open**: L-09 itself needs the lawyer | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Open by design: L-09 (holiday extension of rights clocks, CLK-10 base, interest rate quarter) needs the lawyer; extended dates and interest amounts withheld. |
| F-004 | major | Decision 4.2.1; TRD 5.1; PRD MH-04; UT-05, UT-17 to UT-19 | No rule for which clock is due; notices had no effect on overdue or interest | Wrong overdue status and interest | Author A | CLK-17 governing due date with paths A to H, per amount; overdue and CLK-16 derived only from it; late owner payment stays on day 35; timely Form 1.2 suspends, Form 1.3 disputes, late notice raises L-05. **Open**: validity of a notice stays with the lawyer (L-05) | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Open by design: validity and timeliness of a received notice stays with the lawyer (L-05). |
| F-005 | major | Decision 2, 3, 9 | Tiercord free tools, association kit, trial onboarding, PaySub documents not recorded; PaySub sentence stated as fact | Differentiators overstated | Author A | Rows added to the comparison; both non-feature differences and the backup channel restated; PaySub sentence labelled inference pending `T-0.1.4`; calculator's owner-level limit used as evidence. Persona pages named by the reviewer were not opened by the author | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-006 | major | Decision 10, 8.5, 9; execution-plan M0.3; PRD M-03 | G2 could not be evaluated before G3; error rates missing | False stop understated | Author A | G2 redefined on all pilots from the 20 reports (n / 3 rounded up) and decided day 124; G3 moved to day 125; build moved to months 5-8; error table added. Numbers: G1 or G2 17.4%; with G1b 28.2%; all four 32.3% | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-007 | major | PRD section 6, MH-10, MH-12; schema `support_grant`, `digest_send`, `tenant`; TRD 5.2; IT-02, IT-16 | No role could load customer data; digests not recorded; no pilot dates; business day undefined | Pilot promise undeliverable and unauditable | Author A | `assisted_load` grant (35 days, audited, facts stay estimated); `digest_send` table; pilot dates on `tenant`; business day defined in Decision 5.1 | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-008 | major | PRD MH-13; TRD AD-13, 5.2, 8.4; schema `billing_event`; T-4.3.9; IT-15 | No requirement, contract, task or test for conversion and billing | No path from pilot to paying account | Author A | MH-13 added with webhook contract, credit handling, limits, grace; task and test added; Phase 0 conversion stays manual and is stated. Build estimate rises to 294-443 hours | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed, part open: tenant.plan enum has no value for the CAD 99 launch plan used by MH-13. Author's later edit: `tenant.plan` enum gains `launch`; TRD AD-13, MH-13 and IT-15 use it. Edited after retest; checked by the lead, not re-reviewed. |
| F-009 | major | Decision 1, 2, 6, 8.1, 9, 13; T-0.1.1, T-0.1.5, T-0.2.1, T-0.2.3, T-0.3.1 | CASL and Law Society Act not examined; messages lacked identification and unsubscribe; no liability line | Channel and service rest on unexamined rules | Author A | Both statutes read and described; LQ-01 gates first message, LQ-02 first report, LQ-03 first paid pilot; footers added; contact-tool addresses excluded from email; missing-input line in 8.1. **Open**: all three answers need the lawyer; insurance cost unknown | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Open by design: LQ-01 (CASL), LQ-02 (legal services), LQ-03 (liability and insurance) need written answers before first message, first report and first paid pilot. |
| F-010 | major | TRD 3, 8.9, 8.10; design DD-09; PRD 11; CLAUDE.md; IT-16 | Residency stated while emails carried amounts and names through processors outside Canada | Constraint contradicted | Author A | Emails carry no amounts, names or invoice numbers; processors and locations listed; threat-model rows added. **Open**: provider retention periods not read | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Open by design: email and payment processors' retention periods not read. |
| F-011 | major | Decision 1, 5.1, 7 | Brief's launch 99, minimum 39, maximum 349 not quoted; ARPU explained by an assumed mix | Brief figure lost | Author A | Quoted; base case now a single CAD 99 launch plan, tiers later; day-25 offer names the price; listed in section 7 below | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-012 | major | design DD-05, DD-10, section 6; App-flow 3, S-09; E2E-02, E2E-08 | Superseded shown by strikethrough only; conflict, timeout and S-09 focus unspecified | Screen-reader user cannot tell which lien date is current | Author A | Visible and programmatic "Superseded" / "Current"; focus and announcements defined; E2E-08 extended | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-013 | major | execution-plan 3.1; T-0.1.2, T-0.2.3, T-0.3.2; Decision 5.1 | No controls on hand-made schedules; no second person | Stale date most likely in Phase 0 | Author A | Controls HR-1 to HR-6; Checker role with hours (20-33); acceptance checks cite them. **Open**: the Checker is a role until the founder names a person (Decision 12 item 6) | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Open by design: Checker is a role until the founder names a person. |
| F-014 | major | Decision 5.2, 9; App-flow S-05; schema `project` | Buyer asked for a subcontract date that selects nothing | Wrong facts requested | Author A | Input list by EV code; messages ask for prime contract date and related facts; subcontract date removed everywhere | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-015 | minor | Decision 3, 4.4, L-06 | s. 87.3(1)(c), 87.3(3), 39(1) para. 1.i omitted | Misclassified projects | Author A | All three recorded; project fields for leased premises and municipal interest | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-016 | minor | Decision EV-05, CLK-06; PRD MH-07; schema `reminder.kind` | CLK-06 ran from receipt; no reminder after act-by | Small date error; silent final days | Author A | EV-05 holds day given and day received; reminders at 5, 2, 0 days before the last day | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-017 | minor | Decision 9; T-0.2.1 | 70 against 72; outreach 70-90 against 105 | Figures disagree | Author A | 72 / 144 / 216; T-0.2.1 100-110; reconciliation in execution-plan 5 | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-018 | minor | TRD 5.2, 7, 9; schema ER diagram | Unnamed tools; missing endpoints; PITR cost; two tables absent from diagram | Inconsistency | Author A | Fly.io, Drizzle, GitHub Actions, Vitest, Playwright, k6 named; endpoints added; PITR dropped, RPO now 6 hours; diagram updated | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-019 | minor | Decision 9, 10; T-0.2.2 | Discovery questions absent; G1b labelled `[C]`; second stop condition ungated; email asserted the hypothesis | Fidelity | Author A | Questions listed; G1b `[P]`; gate G1c and metric M-10; email wording conditional | Independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`): Closed. |
| F-020 | minor | execution-plan M3.1 exit, T-1.1.3; this file section 7 row 4 | Ranges left stale by fix round 1: "UT-01 to UT-14", "DD-01 to DD-08", "five other templates" | Misleading cross-references | Author A | Ranges now UT-01 to UT-19, DD-01 to DD-10, six templates; other ranges searched, none stale | Raised by the independent reviewer, 2026-11-10 (`_coordination/review/payclock-ca-round2.md`). Edited after retest; checked by the lead, not re-reviewed. |

### 6.1 Author self-check log

| ID | Check | Found | Action |
|---|---|---|---|
| SC-01 | Links and anchors across ten files | All resolve | None |
| SC-02 | Every referenced ID has a definition | All defined | None |
| SC-03 | Matrix covers every must-have (12 at first writing, 13 since fix round 1); R-01 to R-22 each cite an existing task | Complete | None |
| SC-04 | Screens, API paths, tables, tasks consistent | An early task list included a PDF-extraction task with no must-have | Removed before writing; AI stays out of the MVP (AD-06) |
| SC-05 | Economics: gross profit, payback, break-even, funnel, ramp, binomial probabilities | Reproduced from inputs | None |
| SC-06 | Dates in Decision 4.5 and UT-01 to UT-11 | Reproduced; weekdays and holidays confirmed | None |
| SC-07 | Contrast ratios | Three differed from the first draft by 0.1 to 0.2 | Corrected in design.md |
| SC-08 | Brief fidelity: chat stop rule and offer quoted; figures match | Departures listed in section 7 | Recorded |
| SC-09 | Fix round 1: links, anchors, ID definitions, matrix, risk rows, estimate sums re-run after the edits, with the author's script and the reviewer's integrity script | No broken link or undefined ID; 13 must-haves in the matrix; 22 risk rows; estimates sum to 232-294 and 294-443. The reviewer's script reported `holiday` and `interest_rate` missing from the ER diagram | Relations added in schema.md |
| SC-11 | Final step after retest: ceiling-rule date recomputed by hand and by script (2026-09-15 + 90 = 2026-12-14); links, IDs, matrix, risk rows and estimate sums re-run | Clean | None |
| SC-10 | Fix round 1: new dates (termination, two-lien, paths A to H, un-extended rights dates) and gate probabilities computed by script | Reproduced | None |

## 7. Departures from the brief and items it could not settle

| # | Brief | This repository | Why |
|---|---|---|---|
| 1 | "No product found" for Canadian provincial clocks; USP "The only tracker" | Two products found; USP dropped | `SRC-05`, `SRC-06` |
| 2 | Verdict "pursue" | Validate by hand, then decide | Item 1 |
| 3 | Sub tracks "28 days, 14 days notice" | Sub's clocks are 7 days after the contractor is paid and 35 days after EV-01 | `SRC-01` |
| 4 | "Notice of intention" template; "notice sent" as pilot success | Dropped; six other templates; dated-action metric | `SRC-02`; objectivity |
| 11 | Launch price CAD 99, minimum 39, maximum 349 | Launch plan at 99 adopted as the base case; 39 and 349 unused | Reconciles the brief's revenue per account |
| 12 | Lead cost includes a contact-data tool | Tool addresses not used for email | CASL s. 10(9)(b) |
| 13 | Brief's week-1 gate "8 of 15" | Not used; G1b is the author's 8 of 20 on a different question | Different test |
| 5 | Magic link, Vercel, SMS, QuickBooks/Xero, forwarded email, AI extraction, Alberta, BC waitlist mode | Deferred or replaced (AD-06, AD-08, AD-09, AD-10, AD-12) | ASVS V6.3.6; scope |
| 6 | Cold email says "I built a tracker" | Message says the schedule is prepared by hand | No software exists |
| 7 | 110 development hours | 294-443 hours | Execution plan section 5 |
| 8 | Two 30-day budgets (CAD 1,200 and CAD 1,500) | 1,500 used | Not reconciled in the brief |
| 9 | Funnel "customers" undefined | Read as pilots, with 60% pilot-to-paying | Brief's weekly targets |
| 10 | Stop rule 3 of 20 | Quoted, tested, revision proposed | Decision section 10 |

## 8. Outstanding items

| # | Item | Blocks | Owner | Closes when |
|---|---|---|---|---|
| 1 | In-product behaviour of Tiercord and PaySub for a payee with EV-01 unknown is unverified | The whole product hypothesis (G0) | Founder | `T-0.1.4` |
| 2 | Count of distinct reachable prospects unknown | Funnel, stop-rule sample | Founder | `T-0.1.1` |
| 3 | No lawyer review of rule table, disclaimer, templates (L-01 to L-03) | Any customer-facing date | Founder, Lawyer | `T-0.1.3` |
| 17 | F-003, open by design. Lawyer question L-09: do Legislation Act s. 89(1)-(2) extend the lien and adjudication last days; from which day does the 90-day perfection period count; which quarter's prejudgment rate applies before any proceeding? | Extended rights dates and all interest amounts (withheld) | Founder, Lawyer | Written answer in `T-0.1.3` |
| 18 | F-004, open by design. Lawyer question L-05: is a received Form 1.2 or 1.3 valid and in time, and what follows an unkept undertaking? Decided per notice, never by PayClock | Overdue status and interest on noticed amounts | Customer's lawyer | Each notice |
| 11 | F-009, open by design. LQ-01: does the outreach meet CASL s. 6 and s. 10(9)(b)? LQ-02: is a per-firm schedule the provision of legal services under Law Society Act s. 1(5)-(6), and can it be supervised? LQ-03: what liability cap and insurance, at what cost? | First message, first report, first paid pilot | Founder, Lawyer | `T-0.1.5` |
| 12 | F-013, open by design. Founder decision: name the Checker, a person other than whoever computes the dates | Any hand-run report; rule approval | Founder | Decision 12 item 6 |
| 13 | F-010, open by design. Founder decision after reading the email and payment processors' terms: accept their retention periods or choose other processors | Privacy notice | Founder | `T-1.1.4` |
| 14 | Old s. 31(6)-(7) (notices of termination published before 2026-01-01) not read | Those lien dates stay "not computed" | Rules lead | Decision after pilot |
| 15 | Combined false-stop probability of the proposed gates is about 32% under the stated assumptions | Founder's choice of stop rule | Founder | Decision 12 item 3 |
| 16 | File scanner not chosen (ASVS V5.4.3 not met) | Evidence downloads by viewers | Engineer | `T-2.2.4` |
| 4 | Courts of Justice Act s. 127 now read; which quarter's rate applies before a proceeding is unanswered (L-09); the rate table was not opened | CLK-16 amounts (withheld) | Rules lead, Lawyer | `T-0.1.3` |
| 5 | `ON-2019-10` adjudication and holdback text and `ON-LEGACY` not opened | Those clocks stay "not computed" | Rules lead | Decision after pilot |
| 6 | ODACC report not readable here; no Ontario late-payment or adjudication-use figure | Strength of demand evidence | Founder | Read manually in `T-0.2.4` |
| 7 | Break-even with founder compensation unreachable by the modelled channel; backup-channel rates missing | Business case | Founder | Rates observed in Phase 0 |
| 8 | Development estimate 2.7-4.0 times the brief's | Cash requirement | Founder | Decision before Phase 1 |
| 9 | Location of the founder's VPS unknown | AD-09 host choice | Founder | `T-2.1.4` |
| 10 | Tagged-PDF accessibility of templates undecided ("not met") | WCAG coverage of exports | Engineer | `T-4.3.3` |
| 19 | Holiday table: observed-day substitutions of Legislation Act s. 88 (a listed day on a weekend) are not encoded, and the s. 88(2) list was not re-opened on 2026-11-11 (e-Laws page is script-rendered). Missing a substitute holiday shows a payment due date one day early (the conservative side for counterparty duties); rights clocks are never extended | Customer use of any date near a weekend holiday | Rules lead | Text of s. 88 read and the holiday rows re-verified |
| 20 | `UT-12` needs the Phase 0 lawyer-checked invoices; only the 15 synthetic catalogue cases exist | Gate "all pilot invoices reproduce" | Rules lead | `T-0.1.3`, `T-3.1.7` |
| 21 | L-06 "near" a transition date is not defined (no window), so it is raised only when EV-11 or EV-12 is unknown or the premises facts are unknown in the 2018 lease window | Applicability flags near 2018-07-01, 2018-12-06, 2019-10-01 | Rules lead, Lawyer | A window is decided and added to Decision 4.4 |

## 9. Build milestone B1 (2026-11-11)

On 2026-11-11 the owner authorised implementation in this repository before the Phase 0 sales gate (`T-0.3.4`) had passed. This records that authorisation; the decision text in Decision.md is unchanged, and AGENTS.md section 3 ("No Phase 1-6 work before `T-0.3.4` records build") is overridden for B1 by that instruction only. No outreach, report or customer data was involved. Branch `feat/b1-foundation`, not pushed.

### 9.1 Tasks implemented

| Task | What exists | Not done |
|---|---|---|
| T-2.1.1 | npm workspace in `workspace/` (the root keeps only the ten documents, `.gitignore`, `Makefile`; all paths in this section are relative to `workspace/`) with `apps/web`, `apps/worker`, `packages/rules`, `packages/domain`, `packages/db`, `packages/platform`; import-boundary lint with failing fixtures | CI hook; duplicate-utility check; `packages/templates` (no templates in B1) |
| T-2.1.2 | `make dev` / `scripts/dev.ts`: checks Postgres, migrates, seeds, starts API (8104) and worker, prints "ready" from `/readyz` | Compose file (Docker not installed; stays proposed), storage emulator, mail catcher |
| T-2.1.5 | Typed config (zod), redacting JSON logger, correlation ids, pg-boss queue client | Config hash logging (R-06) |
| T-2.2.1 | Migration `20261111T100000_core.sql`: tenant, app_user, membership, project, subcontract, invoice, event, legal_signoff, rule_version, rule_clock, holiday, interest_rate, computation_run, deadline, flag, reminder, audit_event, api_idempotency; RLS enabled and forced; composite tenant foreign keys; append-only triggers; tenant-scoped client | support_grant, source_document, holdback_entry, action, import tables, digest_send, billing_event, data_request |
| T-2.2.3 | ORM parity check, migration checksum and order check | Backfill runner, concurrent-index convention |
| T-2.2.5 | Audit writer used by every implemented use case | |
| T-3.1.1 to T-3.1.7 | Pure `packages/rules`: civil dates, holiday extension, regime selection, CLK-01 to CLK-11, CLK-13, CLK-14, CLK-16, CLK-17 paths A to H per amount, termination with distinct EV-09/EV-17/EV-18 and the ceiling rule, L-09 withholding, interest arithmetic, golden runner | CLK-12, CLK-15 |
| T-4.1.1 | `POST /projects`, `/subcontracts`, `/invoices` (409 on duplicate number) | S-04, S-05 forms |
| T-4.2.1 | `POST /events` with certainty and unknown | S-08, evidence upload |
| T-4.2.2 | In-transaction recompute under a project lock; fact-version compare-and-set `recompute.batch`; invariant check | Scheduled invariant job |
| T-4.2.3 | `GET /recomputations/{id}` diff (rights clocks moved earlier first); superseded reminders cancelled; urgent reminder row when a rights act-by date moves earlier to within 14 days | S-09 screen; stale actions and L-10 (actions not built) |

Blocked or not started, with reason: T-2.1.3 (CI: no pipeline run in B1; the lead pushes); T-2.1.4 (hosting and database accounts); T-2.2.2 (Supabase Auth account; a fake provider behind an interface is used and refused outside local/test); T-2.2.4 (storage provider); T-4.1.2 and all of M4.3 (out of B1 scope); every Phase 0 and Phase 1 task (go-to-market and lawyer work; L-01 sign-off absent, so every rule version is `draft` and every result carries flag L-01).

### 9.2 Commands and results (clean test database)

Run on 2026-11-11 from `workspace/` after `npx tsx scripts/db-reset-test.ts` (drops `public` and `pgboss` in `payclock_test`); the integration global setup re-migrates and loads draft rules and holidays. All tests connect as `payclock_app` (NOSUPERUSER NOBYPASSRLS) except seeding.

| Command | Result |
|---|---|
| `npm run lint` | 0 problems |
| `npm run typecheck` | 0 errors |
| `npm run test:unit` | 8 files, 65 tests passed |
| `npm run test:integration` | 5 files, 37 tests passed |
| `npm run golden-verify` | 15/15 catalogue cases equal |
| `npx tsx scripts/orm-parity.ts --test` | 0 differences |
| `npx tsx scripts/dev.ts --check` | "ready" with `{"database":true,"queue":true}`; with an unreachable database: "NOT READY: database unhealthy", non-zero |
| `npm audit --omit=dev` | 0 vulnerabilities after upgrading drizzle-orm to 0.45.4 and zod to 4.6.7; dev-only advisories remain in the test runner's dependencies (tinypool via vitest 3.2.4) |

### 9.3 Results per test ID

| Test | Command | Result |
|---|---|---|
| UT-01 to UT-04 | `npm run test:unit` (`counting.test.ts`) | Passed |
| UT-05, UT-06, UT-07 | same (`payment.test.ts`) | Passed |
| UT-08 | same (`regime.test.ts`) | Passed, with the fixture correction in section 9.4 item 1 |
| UT-09 | same (`payment.test.ts`) | Passed: arithmetic CAD 142.03; customer-facing amount withheld (L-09) |
| UT-10, UT-11, UT-15 | same (`rights.test.ts`) | Passed. UT-15 ceiling: CLK-11 "no later than 2026-12-14", 2026-12-15 never output; plus a sweep of 121 termination dates and 90 publication dates showing no ceiling is later than any consistent exact date |
| UT-16 | same | Passed for dates, bounds, single "no later than" date and the s. 39(4) request offer; reminder wording `Not run` (reminders are not sent in B1) |
| UT-13 | same (`determinism.test.ts`) | Passed |
| UT-14 | same | Interest-statement refusal passed; reminder-template part `Not run` (no templates) |
| UT-17, UT-18, UT-19 | same (`payment.test.ts`) | Passed, with the fixture clarification in section 9.4 item 2 |
| UT-12 | `npm run golden-verify` | `Not run` as specified (200 lawyer-checked cases do not exist); the runner passes 15/15 catalogue cases |
| IT-01 | `npm run test:integration` | Partly passed: zero rows without tenant context on every tenant table, writes refused, tenant B gets 404 through API and use cases, job without tenant refused before reading. Export and file link `Not run` (not built) |
| IT-02 | same | Viewer correction 403 passed; the other cases `Not run` (no grants or deletion) |
| IT-03, IT-04, IT-05, IT-06 | same | Passed |
| IT-10 | same | Parity, edited-migration and out-of-order parts passed; backfill and concurrent-index parts `Not run` |
| IT-12 | same | Correlation id on every request log line and no amounts or names passed; rule-approval parts `Not run` |
| IT-14 | same, and `scripts/dev.ts --check` | Worker starts alone without web modules; start command reaches "ready". Recreate-services part `Not run` |
| All other UT, IT, E2E | | `Not run` |

### 9.4 Document corrections made in B1

1. `UT-08` (execution-plan.md 7.1): the first case gave only EV-11 2019-09-30. With EV-12 unknown the regime cannot be chosen (a procurement before 2018-07-01 would make it `ON-LEGACY`), so the engine correctly answers "applicability unknown". The fixture now states EV-12 2019-06-03.
2. `UT-17` to `UT-19`: "same invoice" now says which facts carry over; the late owner payment of `UT-17` is not part of the second `UT-19` case, where the owner pays the noticed amount on 2026-12-01.
3. schema.md: `event.notice_form` (Form 1.2 or 1.3 of EV-05; paths D and E need it) and `event_scope_check`; `deadline.amount_cents` (per-amount CLK-17 and CLK-16), `flags`, `withheld`, `notes`; `deadline.rule_clock_id` nullable when no version covers the clock; `rule_version.family`; new table `api_idempotency`; the interest-rate overlap rule is a trigger because `btree_gist` is not available; the runtime role is `payclock_app` locally; B1 creates only the core tables.
4. execution-plan.md section 6: commands that now exist are marked.
5. AGENTS.md state line, utilities index and commands; CLAUDE.md test status line.

### 9.5 Interpretations made in code, for the Rules lead and lawyer to confirm

- An event not recorded is treated as not having happened; an event recorded with certainty `unknown` happened on an unknown date and makes dependent "earliest of" results "no later than". A recorded EV-18 implies a termination happened, so a missing EV-17 is then treated as unknown (ceiling rule), never as absent.
- An `estimated` trigger leaves the state `computed` (the Decision 4.5 example shows an overdue invoice from an estimated EV-01); the estimated trigger ids travel with the result and block interest statements (UT-14).
- EV-04 `amount_cents` is the part of this invoice's net amount (amount minus holdback) that the owner payment covers; null means all.
- Two liens give two perfection clocks, CLK-10a and CLK-10b, each from its own un-extended CLK-09 day.
- A Form 8 publication dated before EV-17 is inconsistent; the engine uses the earlier date with L-11.
- Rule versions `ON-2019-10` (lien, adjudication, holdback) and `ON-LEGACY` compute nothing ("not computed; lawyer required"); `ON-NOPP` computes lien clocks only.
- Redis database 3 was assigned but is not used: the TRD keeps the queue in Postgres (AD-05). The API runs on `node:http` for B1; a Next.js route handler can wrap it (AD-01 unchanged).
