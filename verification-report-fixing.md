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
| R-01 | A delayed batch recompute or reminder job restores a lien date computed before a correction; the owner trusts the later date | In-transaction recompute; fact-version compare-and-set; one-current-deadline unique index; billing events deduplicated and state re-fetched | Nightly invariant job; discarded-run count | IT-05: stale result discarded, one current deadline; IT-15: late "payment failed" changes nothing. B1 2026-11-11: IT-05 passed (`packages/domain/test/isolation.test.ts`); unique current-deadline index in the migration. Fix round 1: a rule-row or holiday change recomputes every stored deadline and no current deadline stays on a retired revision (`packages/domain/test/review-b1-round1.test.ts` B1-005) | T-4.2.2 |
| R-02 | A reminder email is accepted by the provider after our timeout and shown as failed, so it is resent or the user is told nothing went out; or an import seems lost and is re-uploaded | Idempotency keys; reconcile sweep by `reminder.id`; "check status" | Reminders in `failed` later found `sent`; duplicate provider ids | IT-08, E2E-09: one email, truthful status | T-4.2.4 |
| R-03 | A second day-counting helper in the web app disagrees with the rules package on holiday extension | All date arithmetic only in `packages/rules`; lint bans date maths elsewhere | Lint failures; golden diff | UT-13 plus lint fixture fails on a stray helper. B1 2026-11-11: UT-13 passed; lint fixture `packages/rules/test/boundaries.test.ts` passed (rules may not import, use a clock or floats) | T-2.1.1 |
| R-04 | The web app imports rule internals and bypasses version selection | Entry-point-only imports enforced | Lint | Lint fixture with a deep import fails. B1 2026-11-11: deep-import lint fixture passed (`packages/rules/test/boundaries.test.ts`) | T-2.1.1 |
| R-05 | Another subcontractor sees a firm's disputed invoices and counterparties through an API, job, export or file link | Three-layer tenancy (TRD 8.2); tenant in job payload and storage key | Row-level-security denials; cross-tenant test in CI | IT-01: 404 everywhere, job refuses. B1 2026-11-11: IT-01 API, use-case and job parts passed (`apps/web/test/api.test.ts`, `packages/domain/test/isolation.test.ts`, `apps/worker/test/worker.test.ts`); export and file link not built | T-2.2.1 |
| R-06 | Worker uses a copied holiday list or config and sends reminders on different dates from the screen | One config and one holiday source in shared packages | Config hash logged by both processes at start | IT-14 compares hashes; IT-12. Fix round 1: both processes read the one `holiday` table and its `holiday_coverage` through `loadRules`; config hash logging still not built | T-2.1.5 |
| R-07 | Worker crashes at start because the logger pulls a web-only module; reminders stop silently | Platform package has no web imports; worker start in CI | Readiness check; queue age alert | IT-14: worker healthy alone. B1 2026-11-11: IT-14 worker-alone part passed (`apps/worker/test/worker.test.ts`) | T-2.1.5 |
| R-08 | The one-current-deadline index exists in a migration but not in the ORM and is dropped by a later generated migration, allowing two "current" lien dates | Parity check in CI | `scripts/orm-parity` diff | IT-10: empty diff. B1 2026-11-11: IT-10 parity part passed, empty diff (`packages/db/test/migrations.test.ts`, `scripts/orm-parity.ts`) | T-2.2.3 |
| R-09 | A backfill of `act_by_date` stops halfway; some invoices show no act-by date | Resumable batches with checkpoints; engine tolerates null by recomputing | Checkpoint lag; invariant job | IT-10: interrupted backfill completes on resume | T-2.2.3 |
| R-10 | Two branches add migrations; production applies them in a different order from staging and rule tables diverge | Linear order check | CI failure | IT-10: conflicting branches fail CI. B1 2026-11-11: IT-10 order part passed against fixtures (`packages/db/test/migrations.test.ts`); no CI yet | T-2.2.3 |
| R-11 | Creating an index on `deadline` blocks corrections during business hours | Concurrent index creation, lock timeout | Lock wait metric during deploy | IT-10: writes continue during index build | T-2.2.3 |
| R-12 | A failed reminder cannot be traced to the correction that caused it; or logs expose invoice amounts and general-contractor names | Correlation id through request, job, mail; redaction rules | Log sampling in CI | IT-12: id present end to end; no sensitive values. B1 2026-11-11: IT-12 logging part passed (`apps/web/test/api.test.ts`, `packages/platform/test/platform.test.ts`); job and mail parts not built | T-2.1.5 |
| R-13 | An evidence file overwrites another firm's or another invoice's file | Server-generated keys with tenant, purpose, entity, uuid | Storage audit for keys outside pattern | IT-11: key pattern enforced. B2: key pattern enforced in code and by constraint `source_document_key_check`, cross-tenant upload and download refused (`apps/web/test/documents-minio.test.ts`, passed) | T-2.2.4 |
| R-14 | Uploaded aging lists (customer and amount data) remain after 30 days or after deletion | `expires_at` and nightly sweep with alert | Count of expired objects still present | IT-11, IT-13: expired file gone; deletion complete | T-6.1.3 |
| R-15 | Recreating a service wipes uploaded evidence or the database | Managed database and storage; stateless containers; named volume locally | Restore drill; storage object count | IT-14: data intact after recreation | T-2.1.4 |
| R-16 | A deadline email or evidence link points to `localhost` or an internal host and the owner cannot open it on the due day | Links built only from `APP_PUBLIC_URL`; start fails on loopback in production | Link checker | IT-11, E2E-06: host equals public URL. B2: evidence, invitation and reset links use `APP_PUBLIC_URL` (`documents-minio.test.ts`, `auth-local.test.ts`, passed); E2E-06 `Not run` | T-2.2.4 |
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
| 19 | Holiday table. Corrected in B1 fix round 1 (2026-11-11, not yet re-reviewed): the earlier text here called an early payment date "the conservative side"; that was wrong (Decision.md 4.3 now states the harm of each direction). Civic Holiday, which s. 88(2) does not list, was in the table (B1-001); the s. 88(3)-(5) observed days were missing (B1-002); dates outside 2025-2028 were computed against an empty table (B1-003). Now the rows follow s. 88 exactly (re-read on e-Laws 2026-11-11), cover 2018-2040, and any other year is not computable. Remaining: days proclaimed under s. 88(2) para. 12 are added by the operator (`changeProclaimedHoliday`) and no one watches for proclamations yet | Customer use of a date near a proclaimed day | Rules lead | A proclamation check is part of the monthly rule review (M-06) |
| 20 | `UT-12` needs the Phase 0 lawyer-checked invoices; only the 15 synthetic catalogue cases exist | Gate "all pilot invoices reproduce" | Rules lead | `T-0.1.3`, `T-3.1.7` |
| 21 | L-06 "near" a transition date: since B1 fix round 1 an estimated EV-11 or EV-12 within 365 days of a transition date leaves the regime undecided (B1-004). The 365-day reach is the author's proposal `[P]` (Decision.md 4.4); a confirmed date near a boundary is still not flagged | Applicability flags near 2018-07-01, 2018-12-06, 2019-10-01 | Rules lead, Lawyer | The lawyer confirms or replaces the reach under L-06 |

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

Fix round 1 (2026-11-11) changed T-3.1.1, T-3.1.2, T-3.1.5, T-2.2.1 and T-4.2.2; see section 9.6.

Blocked or not started, with reason: T-2.1.3 (CI: no pipeline run in B1; the lead pushes); T-2.1.4 (hosting and database accounts); T-2.2.2 (Supabase Auth account; a fake provider behind an interface is used and refused outside local/test); T-2.2.4 (storage provider); T-4.1.2 and all of M4.3 (out of B1 scope); every Phase 0 and Phase 1 task (go-to-market and lawyer work; L-01 sign-off absent, so every rule version is `draft` and every result carries flag L-01).

### 9.2 Commands and results (clean test database)

Run on 2026-11-11 from `workspace/` after `npx tsx scripts/db-reset-test.ts` (drops `public` and `pgboss` in `payclock_test`); the integration global setup re-migrates and loads draft rules and holidays. All tests connect as `payclock_app` (NOSUPERUSER NOBYPASSRLS) except seeding.

| Command | Result |
|---|---|
| `npm run lint` | 0 problems |
| `npm run typecheck` | 0 errors |
| `npm run test:unit` | 9 files, 83 tests passed (after fix rounds 1 and 2; 8 files, 65 before round 1) |
| `npm run test:integration` | 7 files, 49 tests passed (after fix round 2; 6 files, 43 after round 1; 5 files, 37 before) |
| `npm run golden-verify` | 15/15 catalogue cases equal |
| `npx tsx scripts/orm-parity.ts --test` | 0 differences (3 migrations) |
| Reviewer scripts `_coordination/review/payclock-ca-b1-*` (run, not edited) | Before fix round 1: engine 23/34, integration 23/25, extra X-1 and X-2 deviating. After: engine 34/34, integration 25/25, X-1 regime undecided with `L-06` and `REGIME_ESTIMATED`, X-2 new revision plus a recompute run. After fix round 2: round-1 engine 34/34 and integration 25/25; round-2 cases 25/25 (N-1e passes); N-6 passes |
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
- Holiday table years: 2018-2040 (`HOLIDAY_YEARS`); `ON-NOPP` lien clocks can start in 2018, and 2040 leaves margin for CLK-10 counts. Extending the range is a data change through `npm run rules:sync`, which recomputes.

### 9.6 Fix round 1 (2026-11-11), findings of `_coordination/review/payclock-ca-b1-round1.md`

Legislation Act, 2006 ss. 88-89 re-read on e-Laws (built-in browser, rendered page) on 2026-11-11 by the author. Every fix below is the author's; none has been re-reviewed.

| Finding | Status | Fix | Permanent regression test |
|---|---|---|---|
| B1-001 (major) | Fixed | Civic Holiday removed; `rules:sync` deletes generated rows no longer produced | `packages/rules/test/review-b1-round1.test.ts` B1-001: 2026-08-03 not a holiday; August due date CLK-17 2026-08-03, CLK-16 2026-08-04; CLK-05(b) 2026-08-03 and a Form 1.2 given 2026-08-04 is path F with L-05 (given 2026-08-03 stays path D). Database row check in `packages/domain/test/review-b1-round1.test.ts` |
| B1-002 (major) | Fixed | s. 88(3)-(5) observed days generated; direction of each one-day error stated in Decision.md 4.3 and item 19 | B1-002: 2027-12-27, 2022-12-27, 2023-01-02, 2029-07-02 present, 2028-01-03 absent; CLK-17 2027-12-28; CLK-09b 2027-12-27 with the L-09 withheld note |
| B1-003 (major) | Fixed | `holiday_coverage` table; the engine fails closed (`not_computable`, missing `holiday_table:YYYY`) for any count, extension or within-time test in an uncovered year; coverage loaded for 2018-2040 | B1-003: 2024 and 2029 cases not computable with a 2025-2028 table and correct (2024-07-02, 2029-05-22) when covered; rights clocks and CLK-10 fail closed; empty table computes nothing |
| B1-004 (major) | Fixed | Estimated EV-11/EV-12 within 365 days of a boundary leaves the regime undecided (L-06); otherwise `REGIME_ESTIMATED` and the ids on every result | B1-004: reviewer X-1 and R-07c cases undecided; far estimate computed and marked on every result; estimate whose reach cannot change ON-NOPP stays ON-NOPP, marked |
| B1-005 (major) | Fixed | Migration `20261111T200000`: `rule_version.revision`, `content_sha256`, one live revision per code; `syncDraftRules` retires a changed version and inserts a new draft revision, rewrites the holiday table, audits, and recomputes every project (`recompute.batch` logic, compare-and-set, retried); a deadline on a retired revision is never "unchanged"; invariant check reports one | `packages/domain/test/review-b1-round1.test.ts` B1-005: proclaimed holiday added moves CLK-17 2026-08-03 to 2026-08-04 (diff cause `holiday_table`, audit rows) and back on removal; rule row changed moves CLK-09b 2026-11-29 to 2026-11-28 with revision r2, r1 retired, invariant clean; restoring gives r3; unchanged sync recomputes nothing; invariant flags a deadline on a retired revision |
| B1-006 (minor) | Fixed (claim now true) | L-01 added to every result while any rule version used is unsigned, including `not_applicable` and applicability-unknown results | B1-006: EV-12 unknown and ON-NOPP cases, every result has L-01 |
| B1-007 (minor) | Fixed | Ids validated as UUIDs in use cases and path parameters: 422 | `apps/web/test/api.test.ts` B1-007 (POST event and GET invoice); domain B1-007 |
| B1-008 (minor) | Fixed | Fake auth refused unless `API_BIND_HOST`, the database host and `APP_PUBLIC_URL` are all loopback (the API binds to `API_BIND_HOST`) | `packages/platform/test/platform.test.ts` B1-008 |
| B1-009 (minor) | Fixed | Anniversary per Legislation Act s. 89(7) | B1-009: EV-11 2028-02-29 gives Form 6 by 2029-03-14 with the s. 89(7) note |

The existing `payclock_dev` database was upgraded by `make dev-check`: new revisions r2 for all four versions, four Civic Holiday rows (2025-2028) removed, the seeded project recomputed.

### 9.7 Retest round 2 verdicts and fix round 2 (2026-11-11)

Reviewer verdicts from `_coordination/review/payclock-ca-b1-verdicts.json` (round 2, head `af8a2d6`), copied unchanged:

| Finding | Severity | Verdict | Open part (reviewer's words) |
|---|---|---|---|
| B1-001 | major | Closed | |
| B1-002 | major | Closed | |
| B1-003 | major | Closed | |
| B1-004 | major | Closed, part open | Estimate wrong by more than 365 days still gives exact computed rights dates under POST-2019 (flagged REGIME_ESTIMATED only); 365 is an unproven [P] reach awaiting the lawyer (L-06) |
| B1-005 | major | Still open | Rule or holiday change commits before an in-process recomputeAll with no durable pending record; a failed or interrupted recompute leaves stored dates stale and a later rules:sync recomputes nothing (N-1e payment date; N-6 lien date one day later than the rule in force) |
| B1-006 | minor | Closed | |
| B1-007 | minor | Closed | |
| B1-008 | minor | Closed | |
| B1-009 | minor | Closed | |

Fix round 2 edits (author; fixed after retest, not yet re-reviewed):

| Finding | Status | Fix | Regression test |
|---|---|---|---|
| B1-005 | Fixed after retest | Migration `20261111T300000`: `rules_generation`, `computation_run.rules_gen`/`holiday_gen`, `recompute_pending`, function `enqueue_stale_recomputes()`. A rule or holiday change, the generation bump and one pending row per project commit in one transaction. The worker drains open rows every 15 s and records attempts and errors until each is done; draining is idempotent. Every `rules:sync` re-queues any project with a current deadline from an older generation and drains. Batch recompute is compare-and-set on both fact version and generation. On read, a deadline from an older generation is `recompute_pending` with no date (`getInvoice`); a recomputation diff from an older generation says `computed_under_superseded_rules`. The invariant check reports stale deadlines with no open pending row | `packages/domain/test/review-b1-round2.test.ts`: N-6 (CLK-09b rule 60 to 59 days, recompute fails: read shows `recompute_pending` and never 2027-12-27; later sync gives 2027-12-26); N-1e (proclaimed day, recompute fails: pending; later no-change sync gives 2027-12-29); crash between commit and recompute (a failed drain leaves the row open; the worker drain alone finishes it; a second drain does nothing); lost pending row (read shows pending, invariant reports it, the runtime-role scan re-queues it). `apps/worker/test/worker.test.ts`: drain loop runs without error |
| B1-004 | Part open, unchanged in this round | The coordinator's round-2 ruling covered B1-005 only | |

Also fixed in this round: the round-1 rule-change test asserted absolute revision numbers and restored the database only on success, so a different file order left a changed rule in the shared test database; it now asserts relative revisions and restores in `finally`. The integration suite passed under five shuffled file orders (`--sequence.shuffle.files`, seeds 1-5). The reviewer's raw SQL in N-6 still reads the stored (superseded) row; the application read path never presents it.

Residual: no alert yet on pending rows older than one hour; reminders are not sent in B1, so the send-time re-check that would refuse a reminder for a pending deadline (TRD 6.1) is not built.

### 9.8 Retest round 3 verdicts and round-3 hardening (2026-11-11)

Reviewer verdicts from `_coordination/review/payclock-ca-b1-verdicts.json` (round 3, head `891037c`), copied unchanged:

| Finding | Verdict |
|---|---|
| B1-001 | Closed |
| B1-002 | Closed |
| B1-003 | Closed |
| B1-004 | Closed, part open: an estimated EV-11 or EV-12 wrong by more than 365 days still gives exact computed rights dates under POST-2019, flagged REGIME_ESTIMATED only; the 365-day reach is a labelled proposal awaiting the lawyer (L-06) |
| B1-005 | Closed |
| B1-006 | Closed |
| B1-007 | Closed |
| B1-008 | Closed |
| B1-009 | Closed |

Reviewer reproduction (round 3): lint clean, typecheck clean, unit 83/83, integration 49/49, golden 15/15, ORM parity 0, reviewer round-1 engine 34/34, round-1 integration 25/25, round-2 25/25 + N-6 pass, round-3 new 10/10. New findings: none.

Hardening of two round-3 observations (section 5 of `payclock-ca-b1-round3.md`), **fixed after round-3 retest, lead-checked**:

| Item | Fix | Test |
|---|---|---|
| `recompute_pending` had no row-level security | Migration `20261111T400000_recompute_pending_rls.sql`: tenant foreign key, RLS enabled and FORCED, policy `recompute_pending_isolation` (`tenant_id = app_current_tenant()`), insert grant; ORM model matches (`tenantPolicy`, `enableRLS`). The worker claims rows through SECURITY DEFINER `claim_recompute_pending(limit)` (identifiers only, no `last_error`) and counts through `open_recompute_pending_count()`; each outcome is written inside that row's tenant transaction. The drain now closes a row only if its generation is still the one the recompute reached (the "closed early" observation) | `isolation.test.ts`: `recompute_pending` added to the zero-rows-without-context and cross-tenant loops; new case: RLS and FORCE set, an open row of tenant A is invisible and not updatable without context, invisible to B, B cannot insert one for A, the claim function returns no row text |
| No test killed the worker mid-drain | `drainPending` gained `DrainHooks` (`afterRead`, `afterRow`) as test seams; `packages/domain/test/fixtures/drain-child.ts` runs the drain in its own process and pauses at a chosen point | `drain-crash-resume.test.ts` (8 projects over two tenants, CLK-09b 60 to 59 days): (1) SIGKILL inside the third row's recompute, after read and before write: exactly two rows closed, the rest open; every read is `recompute_pending` with null dates or the new date 2027-12-26, never 2027-12-27; invariants clean; the next drain closes the rest with no failure; no current deadline on an older generation or retired revision; a further drain does nothing. (2) SIGKILL after the first row (later rows claimed, untouched), then a second rule change before resuming: no read shows either superseded date; the resume converges to the final rule with nothing open |

Commands (from `workspace/`, after `npm run db:reset-test` and `npm run db:migrate-test`, 4 migrations):

| Command | Result |
|---|---|
| `npm run lint` | 0 problems |
| `npm run typecheck` | 0 errors |
| `npm run test:unit` | 9 files, 83 passed |
| `npm run test:integration` | 8 files, 52 passed; also 52/52 under `--sequence.shuffle.files` seeds 1, 2, 3 |
| `npm run golden-verify` | 15/15 |
| `npm run orm-parity -- --test` | 0 differences |
| `make dev-check` | ready, `{"database":true,"queue":true}` |

## 10. Build milestone B2 (2026-11-11)

Owner request of 2026-11-11 (`_coordination/B2-GUIDE.md`): build what needs no external account. Branch `feat/b2-local-auth`, created from `feat/b1-foundation` at `2abd310` (the round-3 hardening, section 9.8). Not pushed.

### 10.1 What was built

| Task | Built | Not built |
|---|---|---|
| T-2.2.2 | Local sign-in per TRD 8.1 and AD-08: email and password plus TOTP (optional for tenant users; an operator without TOTP gets an enrol-only session). Supabase Auth, named in the TRD, is **not used** (no account; owner instruction) and is recorded as a deferred option behind the same `AuthProvider` interface. Sessions in `auth_session`; `__Host-` cookie with Secure, HttpOnly, SameSite=Strict, Path=/; 12-hour idle and 7-day absolute timeout; new token on sign-in; sign-out, sign-out everywhere, revocation on membership removal and password reset; anti-forgery token, JSON-only bodies and an Origin check; delays per account and per address (configuration in TRD 8.1); roles from schema.md section 5 (owner manages the team; member sees own membership; viewer read only); invitation flow (72 hours, single use) including a first-owner invitation for onboarding; password reset link (60 minutes, single use; TOTP still required after it). The B1 fake provider is removed from the server; it remains only in `apps/web/test/fake-auth.ts`, and configuration allows `AUTH_MODE=fake` only with `APP_ENV=test` | `read` and `assisted_load` support grants (IT-02 operator cases); password change while signed in; re-authentication before TOTP enrolment; TOTP removal and recovery codes; breached-password set; per-user API rate limit; sign-in UI (no frontend) |
| T-2.2.4 | Storage interface in `packages/platform` over the S3 API (MinIO locally, bucket `payclock-dev`); keys `t/{tenant}/{purpose}/{entity}/{uuid}.{ext}` built by the server and checked again before every storage call and by a database constraint; `source_document` with forced RLS; upload `POST /documents` (PDF, PNG, JPEG, CSV; 10 MB; declared type and content signature must agree); 5-minute HMAC-signed link on `APP_PUBLIC_URL` that also needs a session of the same tenant; download with a server-set file name; objects never public | Malware scanner (V5.4.3): only a local signature re-check, refused outside local and test; expiry sweep of temporary import files |
| Mail | `packages/platform` mailer over SMTP (nodemailer 10.2.1): Mailpit at 127.0.0.1:1025 locally; production selects a provider relay by settings, and configuration requires TLS outside local and test. Auth emails carry a link and fixed wording only (no amounts, invoice numbers, contractor or owner names) | Reminder and digest emails (T-4.3.2) |

New migration `20261111T500000_local_auth_and_documents.sql` (tables `user_credential`, `auth_session`, `auth_token`, `auth_throttle`, `source_document`; functions `user_active_memberships`, `record_auth_event`); ORM model matches (parity 0). Dependencies added: `nodemailer` 10.2.1, `@aws-sdk/client-s3` 3.1153.0, `@types/nodemailer` 8.0.2 (dev); `npm audit --omit=dev`: 0 vulnerabilities. Local values (auth key, MinIO local credentials) are only in the git-ignored `.env.local` and `.env.test` written by `npm run db:bootstrap`; `workspace/.env.example` lists the names.

Departure from the B2 task message, recorded: the lead's message said "email link plus TOTP"; TRD 8.1 and AD-08 specify password plus TOTP and explicitly no sign-in by email link (ASVS V6.3.6). The TRD wins (AGENTS.md section 2), so email links are used only for invitations and password reset.

### 10.2 Commands and results (clean test database)

From `workspace/`, with Mailpit and MinIO running, after `npm run db:reset-test` and `npm run db:migrate-test` (5 migrations):

| Command | Result |
|---|---|
| `npm run lint` | 0 problems |
| `npm run typecheck` | 0 errors |
| `npm run test:unit` | 11 files, 97 passed (adds `packages/domain/test/unit/auth-crypto.test.ts`: RFC 6238 vectors, replay window, scrypt, password rules, AES-GCM, storage keys; `apps/web/test/unit/cookies.test.ts`; updated config tests) |
| `npm run test:integration` | 10 files, 78 passed (adds `apps/web/test/auth-local.test.ts` 18, `apps/web/test/documents-minio.test.ts` 8); also 78/78 under `--sequence.shuffle.files` seeds 1 and 2 |
| `npm run golden-verify` | 15/15 |
| `npm run orm-parity -- --test` | 0 differences |
| `make dev-check` | ready, `{"database":true,"queue":true,"storage":true}`; the seed sent first-owner invitations for the two synthetic tenants to Mailpit |

Integration cases against Mailpit and MinIO (all passed): first-owner invitation read from Mailpit, weak password refused, password set, link reused refused (410); sign-in cookie attributes; session hash only in the database; CSRF missing or wrong, foreign Origin, form content type refused; TOTP enrolment, code required, code reused refused; logout invalidates on the server; new token on sign-in revokes the presented one; owner invites a member through the API, the member accepts from Mailpit and signs in; member and viewer permission refusals; expired invitation refused; member removal revokes the live session; last owner cannot be removed; tenant A session gets 404 on tenant B records, cannot sign in to B, and a session row pointed at B is refused (no membership); wrong passwords lead to 429 with `Retry-After` even for the right password, then work again after the delay; unknown account gets the same answer; idle and absolute expiry refused; password reset from Mailpit, single use, revokes sessions, TOTP still required, unknown email gets the same 202 and no mail, expired reset refused, reset requests throttled; operator without TOTP restricted to enrolment; upload and download for tenant A on MinIO; anonymous MinIO GET 403; link host equals `APP_PUBLIC_URL`; tenant B: link 404, A's signed link 403, upload on A's invoice 404; tampered and expired link 403; renamed executable as PDF 415, other type 415, over 10 MB 413, viewer upload 403; file not clean cannot be linked; out-of-prefix key refused by constraint; no rows without tenant context; every test object deleted from MinIO and checked gone; only the Mailpit messages the run read are deleted.

### 10.3 Results per test ID (changes only)

| Test | Result |
|---|---|
| IT-01 | Extended: session cookie of tenant A refused for tenant B through API and file link (`auth-local.test.ts`, `documents-minio.test.ts`). Export `Not run` (not built) |
| IT-02 | Viewer write 403 and member team-management 403 passed; operator grant cases `Not run` (support grants not built) |
| IT-11 | Renamed executable 415, link host equals `APP_PUBLIC_URL`, expired link refused: passed. Expired import file swept: `Not run` (sweep not built) |
| All others | As in section 9.3 |

### 10.4 OWASP ASVS 5.0.0 requirements addressed (implemented controls, not a conformance claim)

IDs follow ASVS 5.0.0 as cited in TRD 8.1 and 8.7; where the numbering below goes beyond the TRD's own citations it is the author's reading of ASVS 5.0.0 and should be checked by the reviewer.

| Implemented | Control |
|---|---|
| V6.2.1, V6.2.9 | 12 to 128 characters accepted |
| V6.2.5, V6.2.10 | No composition rules, no forced rotation |
| V6.2.4 (partial), V6.2.11 | Short local common-password list and patterns (not a top-3000 list); email local part and product name refused |
| V6.3.1, V6.1.1 | Delays per account and per address, no hard lock; configuration documented in TRD 8.1 |
| V6.3.2 | No default accounts; the seed invites, it sets no password |
| V6.3.6 | No sign-in by email link |
| V6.4.1 | Invitation and reset links 256-bit random, expire (72 h, 60 min), single use |
| V6.4.3 | Reset keeps TOTP required |
| V6.5 (TOTP) | RFC 6238, one step either side, each step used once, secret 160-bit random and encrypted at rest |
| V7.2.1, V7.2.3, V7.2.4 | Server-side session check per request; 256-bit random reference token stored hashed; new token at sign-in |
| V7.3.1, V7.3.2 | 12-hour inactivity, 7-day absolute lifetime |
| V7.4.1, V7.4.2, V7.4.3 | Server-side sign-out; sessions end when a membership is removed; all sessions end at password reset; sign out everywhere |
| V3.3.1 to V3.3.4 | `__Host-` cookie, Secure, HttpOnly, SameSite=Strict |
| V3.5.1 | Anti-forgery token on every state-changing session request, JSON-only bodies, Origin check |
| V8.2.1, V8.2.2 | Role checks (schema.md section 5) and tenant row-level security on every request |
| V11.4.2 | scrypt (N = 2^17, r = 8, p = 1 outside local and test) |
| V5.2.1, V5.2.2, V5.3.2, V5.4.1 | 10 MB limit; type and content signature agree; server-generated object keys; server-set download file name |
| V16.3.1 | Sign-in success and failure, sign-out, reset, TOTP enrolment and team changes written to `audit_event` |
| V13.3.1 | No secret in the repository; names only in `.env.example` |

Not addressed: V6.2.2 and V6.2.3 (password change while signed in), V6.2.12 (breached-password set; needs a corpus or an outside service), V6.3.3 (MFA for every user at level 2: TOTP is optional for tenant users by design), V6.3.8 in full (a TOTP user learns the password was right from `totp_required`), V7.5.x (re-authentication before changing the authenticator), recovery codes and TOTP removal, V2.4.1 beyond sign-in, reset and invitation (no general per-user API rate limit), V5.4.3 (no malware scanner), V12.x (TLS: local runs on http; deployment out of scope), V6.6 and V10 (no out-of-band or OAuth/OIDC; external identity providers deferred).

### 10.5 Residuals

- Sign-in and invitation emails are sent inline after the commit, not through the queue; a failed send is logged (`request.after_commit_failed`) and the owner can invite again.
- The session row's `csrf_sha256` is recorded, but the token is derived from the session id with HMAC (`AUTH_SECRET_KEY`), so rotating that key ends every session and link.
- Client address for throttling is the socket address; behind a proxy a trusted forwarded-address setting is needed (not built).

### 10.6 Security fixes after B2 review, awaiting recheck (2026-11-11)

Findings of `_coordination/review/payclock-ca-b2-sec-round1.md` (head `e5966b3`), with the coordinator's rulings. Status of every row: **security fixes after B2 review, awaiting recheck**.

| Finding | Fix | Permanent regression test |
|---|---|---|
| B2-S01 (major) | Every sign-in (and existing-account invitation acceptance) reserves one attempt on all its counters in one transaction that locks the counter rows in key order, before the password or TOTP code is checked; while any counter is in its delay nothing is counted and the reply is 429 | `apps/web/test/auth-security.test.ts`: 40 parallel wrong passwords, at most 5 evaluated; 40 parallel wrong TOTP codes with the right password, at most 5 evaluated |
| B2-S02 (major) | The 15-minute account lock is gone. Long delays (15 min cap) are per client: account plus address, and address alone. The account-wide delay is capped at 30 s. A browser that has signed in to the account before carries a device cookie (`__Host-payclock_session_device`, HMAC-bound to the account) and is counted on its own key instead of the account-wide one. TRD 8.1 updated | Paced attack from 16 rotating addresses: the owner with the right password and TOTP gets in after at most 30 s; during the account-wide delay the owner's usual browser gets in at once, a new browser waits, another account's device cookie does not help, and a stolen device cookie is itself limited; the attacking address meets the long delay |
| B2-S03 (major) | The reset request does only the input check and the reservation before replying; the account lookup, link and email run in the background (`settle()` waits for them in tests and at server shutdown) | 15 known and 15 unknown addresses: identical status and body, timing distributions overlap, the known address still gets its email. Killed the mutation "send inline" |
| B2-S04 (minor) | Invitation acceptance by an existing account uses the sign-in counters | 8 wrong passwords at accept: 401 for the free tries, then 429; the right password works after the delay |
| B2-S05 (minor) | Allow-lists are `Map`s; `Object.prototype` member names (`constructor`, `__proto__`, `toString`, ...) as purpose, entity type, entity id or content type are refused with 400 | `documents-minio.test.ts`: four names as entity type, `constructor` as content type and `valueOf` as purpose give 400, nothing stored |
| B2-S06 (minor) | An operator without TOTP can enrol only with a single-use code issued out of band (`npm run auth:operator-enrolment`, 24 h, emailed; new enum value in migration `20261111T600000`) | `auth-local.test.ts`: enrolment without the code 403, with a wrong code 410, with the emailed code 200, the same code again 410 |
| B2-S07 (minor) | Tests added for each uncovered claim | Per-address limit (22 accounts from one address, 429 on the 22nd); sign-in audit rows (`auth.sign_in_failed.password`, `auth.signed_in`, `auth.signed_out` with the user id); sign out everywhere across two tenants; foreign and `null` Origin on all four public routes; `packages/platform/test/repo-hygiene.test.ts` for V13.3.1 (no tracked env file with values, no local secret value, private key, cloud key or database password in any tracked file) and V6.3.2 (no migration or script creates a credential; the seed creates owners only as invited). Mutations M1 to M4 and "reset sends inline" were each applied by hand and each made the suite fail; restored |

Commands (from `workspace/`, after `npm run db:reset-test` and `npm run db:migrate-test`, 6 migrations): `npm run lint` 0 problems; `npm run typecheck` 0 errors; `npm run test:unit` 12 files, 100 passed; `npm run test:integration` 11 files, 90 passed; `npm run golden-verify` 15/15; `npm run orm-parity -- --test` 0 differences.

Reviewer's attack script `payclock-ca-b2-sec_attack.mts`. **Before the fixes:** 24 HOLDS, 6 FINDING (S-04, S-05, S-09, S-13, S-26, S-27), 3 NOTE. **After the fixes:** the unmodified script stops at S-21, because its helper enrols the operator's authenticator without a code, which B2-S06 now refuses (19 HOLDS and 1 FINDING before it stops). A scratch copy, with only that call changed to record the refusal, runs to the end: 29 HOLDS, 1 FINDING, 3 NOTE. S-21 now shows `enrolment_token_required`. The remaining FINDING is S-09. It tries the owner's right password from a new browser right after the attacker's last guess, and gets 429 with `Retry-After: 30` (before the fix: 900). Under the coordinator's ruling (a capped per-account delay; the right credentials succeed once the short delay has passed) this is the intended result. The owner's usual browser is exempt through the device cookie. Residual: under a continuous attack, an owner on a new browser may have to retry each time a 30-second window ends.

Not changed: `auth_throttle` keys still hold raw email addresses and client addresses, and are never swept (reviewer's note). The reviewer's S-09 pacing reads those keys, so hashing them would have hidden the case; a sweep is still to be built.


## C1 corrections 2026-11-11 (lead-checked, not independently reviewed)

External review of the GTM playbook; the lead's check notes are `_coordination/review/C1-review-check.md` and `C1-online-checks.md`. Engine version `payclock-rules 0.1.1` (output notes and actions changed; no date changed).

| Item | Finding | Files changed | Test added | Source (consulted 2026-11-11) |
|---|---|---|---|---|
| 1 Unknown upstream date | Engine already gave no EV-01-based date (paths G, H). Missing: the next step in the output. Every payment clock missing EV-01 now carries the note "confirm the date the contractor gave its proper invoice to the owner" and actions `ev01_date_request` (template already in the MH-08 set; templates are not code yet, `packages/templates` proposed) and `record_ev01_reply`. The API label reads "not computable: confirm the GC's proper-invoice date" and `next_step` names the template and `POST /api/v1/events` with EV-01 | `packages/rules/src/engine.ts`, `index.ts`; `packages/domain/src/queries.ts`; Decision.md 4.2.1 path H; PRD.md section 1, MH-04; App-flow.md S-07; TRD.md API table; execution-plan.md 7.1; CLAUDE.md; AGENTS.md | `UT-20`: `packages/rules/test/c1-corrections.test.ts`, `packages/domain/test/unit/present-deadline.test.ts`; `core-path.test.ts` "unknown saves" updated (failed on the old label, passes now) | Construction Act s. 6.5(4), https://www.ontario.ca/laws/statute/90c30 (SRC-01) |
| 2 Sales wording | No "never miss" or "35-day date on every invoice" in this repository's copy; the outreach subject "the 35-day date on your [Company] invoices" and "each open invoice with the date it becomes overdue" were rewritten to what the product does. Wording rule added | Decision.md section 9; PRD.md section 1; CLAUDE.md | docs only | n/a |
| 3 Lien perfection | Engine was already right: CLK-10 counts 90 days from the un-extended CLK-09 day of the same lien (the last day it could have been preserved under s. 31). No doc said "perfect within 90 days"; the CLK-10 row and MH-05 now state s. 36(2) in full | Decision.md 4.2 CLK-10 row; PRD.md MH-05; execution-plan.md T-3.1.4 | `UT-21` (passes on old and new code: confirms, does not change behaviour) | s. 36(2) read on the rendered e-Laws page, currency date 6 Nov 2026, https://www.ontario.ca/laws/statute/90c30 |
| 4 Competitors | "PaySub does not mention notices" was wrong. PaySub: lien rights engine, "Generate legal notices in one click", GC emails at day -7, 0, +3, +14; Solo CAD 29, Business CAD 59. Tiercord Starter CAD 59 (49 annual) includes unlimited notices, declarations and AI adjudication assistance. Gap re-stated as one unverified hypothesis (EV-01 unknown); open decision 8 `[P]` | Decision.md section 3 table, candidate 3, new "stated plainly" paragraph, section 12, section 13; PRD.md section 1; CLAUDE.md | docs only | https://paysub.ca ; https://tiercord.ca/pricing |
| 5 Expected outputs | Missing upstream date, partial payment, notice of non-payment received: table Decision.md 4.2.3 | Decision.md 4.2.3; execution-plan.md 7.1 | `UT-20`, `UT-22` in `c1-corrections.test.ts` | Construction Act ss. 6.5(2), (4), (5) (SRC-01) |
| 6 Market size | Ontario NAICS 238210 + 238220, 5-49 employees: 4,516 locations (2,166 + 2,350); 5-99: 4,802. Locations, not firms. MCAO "nearly 300" (undated); ECAO count not published. Pool assumption 1,500 left unchanged; open decision 7 `[P]` | Decision.md 8.4, section 12, SRC-12, new SRC-18 | docs only | https://www150.statcan.gc.ca/n1/tbl/csv/33101174-eng.zip (CSV read); https://www.mcao.org/ ; https://ecao.org/about/ |

Commands (from `workspace/`, after `npm run db:reset-test` and `npm run db:migrate-test`, 6 migrations): `npm run lint` 0 problems; `npm run typecheck` 0 errors; `npm run test:unit` 14 files, 113 passed (before: 12 files, 100); `npm run test:integration` 11 files, 90 passed (before: 90); `npm run golden-verify` 15/15; `npm run orm-parity -- --test` 0 differences; `make dev-check` ready.
