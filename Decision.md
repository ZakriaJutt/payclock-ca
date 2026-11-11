# Decision — PayClock (Ontario subcontractor payment-clock tracker)

Repository `payclock-ca`. Written 2026-11-10; revised the same day after independent review round 1 (findings `F-001` to `F-019`). Planning documents only; no application exists. Nobody has interviewed a customer; willingness to pay is unproven.

## 0. How numbers and claims are labelled

| Label | Meaning |
|---|---|
| `[C]` | Stated in the earlier chat or its decision brief (research items keep the brief's own status) |
| `[S: SRC-nn]` | Read by the author at the named source in section 13 on 2026-11-10 |
| `[A]` | Assumption; not a finding |
| `[P]` | Proposal by the author; the chat did not decide it |

"Not decided in chat" means the brief is silent. IDs used across the repository: `MH-nn` must-haves ([PRD.md](PRD.md)), `S-nn` screens ([App-flow.md](App-flow.md)), `AD-nn` architecture decisions ([TRD.md](TRD.md)), `T-p.m.t` tasks, `HR-n` hand-run controls and `UT-/IT-/E2E-nn` tests ([execution-plan.md](execution-plan.md)), `R-01..R-22`, `F-nnn`, `SC-nn` ([verification-report-fixing.md](verification-report-fixing.md)), `CLK-nn` clocks and `EV-nn` events (section 4), `L-nn` lawyer-required points and `LQ-nn` legal questions that gate Phase 0 (section 6).

## 1. Proposed decision

**Do not build yet. Run Phase 0 by hand (tasks `T-0.1.1` to `T-0.3.4`) and build only if the gates in section 10 pass. No message is sent and no report is delivered until legal questions `LQ-01` and `LQ-02` are answered in writing.** `[P]`

This departs from the brief's verdict of "pursue" `[C]`. Reason: the brief's gap statement, "No product found that tracks Canadian provincial prompt-payment, adjudication, holdback and lien dates per invoice for the unpaid party" `[C]`, **did not verify**. Two Ontario products were open on 2026-11-10: PaySub at CAD 29 and 59 per month `[S: SRC-05]` and Tiercord at CAD 59, 149 and 599 per month `[S: SRC-06]`. Tiercord's public pages cover every statutory clock the brief planned. The decision therefore narrows to one question (section 3).

| Item | Decision | Label |
|---|---|---|
| Launch market | Ontario; Toronto first. Electrical and mechanical subcontractors on commercial and institutional projects | `[C]` |
| Daily user | Office manager or controller who does receivables | `[C]` |
| Buyer and budget owner | The owner of the subcontracting firm | `[C]` |
| Firm size | 5-50 employees, CAD 1M-15M revenue | `[C]` |
| Current workaround | Spreadsheet aging report, calendar reminders, calling the general contractor's payables clerk, a lawyer once an invoice is 60-90 days late, free single-use law-firm calculators | `[C]` |
| Offer | Free deadline report on the firm's open invoices, then a 30-day pilot for CAD 99 | `[C]` |
| Prices | Chat: CAD 59 / 129 / 299 per month. Brief's pricing block: launch price CAD 99, minimum 39, maximum 349; 15% annual discount. Section 7 reconciles them | `[C]` |
| Channel | Cold email plus phone to association member lists; backup: association webinars, lawyer and bookkeeper referrals | `[C]` |
| Prospect source | ECAO, Mechanical Contractors Association of Ontario, Toronto Construction Association member lists | `[C]` |
| Sample inputs | The prospect's aging report (open invoices) plus the facts in section 5.2 | `[C]` + `[P]` |
| Pilot duration and price | 30 days, CAD 99, credited to the first quarter | `[C]` |
| Sales cycle | 21 days from first touch to signed pilot | `[C]` |
| Stop rule | Quoted in section 10 | `[C]` |
| Alberta rules, BC waitlist mode, QuickBooks/Xero sync, SMS, forwarded email | Deferred until Ontario gates pass | `[P]` |

There are two pilots in this plan: the **hand-run pilot** (Phase 0, CAD 99, no software) and the **application pilot** (Phase 6). "Pilot" without a qualifier means the hand-run pilot.

Vendor-advertised features are not customer outcomes. Everything in section 3 about PaySub and Tiercord is what their sites say; no customer result for either was found or measured.

## 2. Evidence and counterargument

**Strongest supporting evidence.** The rules are live law: Part I.1 of the Construction Act has applied since 2019-10-01 and was amended effective 2026-01-01 `[S: SRC-01]`. The Act makes a subcontractor's payment clock depend on an event the subcontractor does not witness: the contractor *giving* the proper invoice to the owner (s. 6.5(4)) `[S: SRC-01]`. Tiercord's own free tool confirms the limit from the other side: its calculator turns "a confirmed proper-invoice date into the ordinary owner payment and notice windows", and its contract review covers "several owner-level invoices" `[S: SRC-07]`. Survey evidence of late payment is from British Columbia, not Ontario: 91% of BCCA employer respondents were paid late at least once in the past year (2025, status verified in the brief) `[C]`.

**Strongest counterargument.** Tiercord sells "Unlimited everything: jobs, users, invoices, notices, declarations" with provincial deadline tracking for CAD 59 per month to firms billing up to CAD 1M, with a 30-day free trial that "includes every product capability, dedicated onboarding and priority support", plus six free tools that need no account `[S: SRC-06]`, `[S: SRC-07]`. PaySub offers a 14-day free trial `[S: SRC-05]`. PayClock asks CAD 99 for a pilot of something two competitors let a prospect try for nothing, and its free report competes with free tools. The brief's own commercial risk also stands: subcontractors may not act on dates for fear of losing work from the general contractor `[C]`. And the hand-run service may itself be the provision of legal services by a non-licensee (section 6, `LQ-02`).

## 3. Competitor gap: the decisive question

**Question.** Which Ontario subcontractor payment event, exception or notice remains underserved by PaySub and Tiercord?

What each site showed on 2026-11-10 (public pages only; the author did not create trial accounts, so in-product behaviour is unverified):

| | PaySub `[S: SRC-05]` | Tiercord `[S: SRC-06]`, `[S: SRC-07]` |
|---|---|---|
| Positioning | "built for small Canadian subcontractors"; Ontario only | "Construction prompt-payment compliance for Canada"; subs and general contractors; Ontario, Alberta, Saskatchewan, Manitoba, BC (pending), federal |
| Price, monthly billing, CAD, per company | Solo 29 (up to 5 active projects); Business 59 (unlimited projects, team access) | Starter 59 (billing up to 1M/yr); Professional 149 (over 1M to 3M); Business 599 (over 3M to 10M); Enterprise custom |
| Price, annual billing, per month | "Save 20%": 23.20 / 47.20 (computed) | 49 / 124 / 499 |
| Trial | 14 days, no card | 30 days on Business, no card; includes dedicated onboarding and priority support |
| Free without an account | None seen | Six tools: payment deadline calculator, proper-invoice checklist, payment chain explorer, contract payment review, payment timeline builder, holdback worksheet ("Your entries stay in your browser"); guides and lessons |
| Association and educator material | None seen | "For associations & educators": free teaching notes, a 30-minute session outline, offer of an education session |
| Payment clock stated | "your GC must pay within 28 days"; tracks "submitted date, statutory due date" | 28, 14, 7, 35 (42 at the next tier), 21, 90, 30, 15 days with section references |
| Notices of non-payment | Not mentioned | Wizard; Forms under O. Reg. 303/18; upload of received notices; delivery record |
| Adjudication | Not mentioned | Case record, timetable, AI-assisted submissions |
| Holdback | Amount per pay application | Ledger, lien-window dates, annual release under s. 26 |
| Lien | 60 days "from last work"; "legal notices in one click" | 60 days from the earliest applicable trigger |
| Documents | "CCDC-standard payment applications and Ontario-compliant legal documents, pre-filled" | Invoices, notices, CCDC 9A/9B statutory declarations |
| Reminders | Emails the general contractor at day -7, 0, +3, +14 automatically | Reminders, calendar feed, workflows |
| Corrections and audit | Not mentioned | "Hash-chained audit trail"; "Every deadline recomputed daily" |
| Integrations | None listed | QuickBooks Online, Xero, Procore, Jobber |
| Lawyer review of content | "Always consult a licensed construction lawyer before filing lien documents" | Learn guides state the edition "has not been represented as independently reviewed by a lawyer"; terms cap liability at the greater of 12 months' fees and CAD 100 |

Like-for-like price for the brief's buyer (CAD 1M-15M revenue `[C]`), monthly billing, CAD, per company: PaySub 59; Tiercord 149 (1M-3M), 599 (3M-10M), custom above; PayClock launch price 99, later tiers 59/129/299 `[C]`. PayClock is not cheaper than PaySub at any size and is cheaper than Tiercord only above CAD 1M. The brief's rationale compared against Levelset's USD 59 per notice `[C]` (CAD 81.42 at the brief's scenario rate of 1 USD = 1.38 CAD, USD to CAD, an adjustable assumption, not a sourced rate); that is a per-document price in another country and is not like-for-like.

**Answer `[P]` (a hypothesis for Phase 0, not a finding).** Features in the brief's MVP list are served, at least as advertised. Three payee-side situations were not shown as handled on either public site:

| Rank | Candidate | Why it may be underserved | Evidence still needed |
|---|---|---|---|
| 1 | **EV-01 unknown**: the subcontractor does not know when the contractor gave the proper invoice to the owner, so the governing due date `CLK-17` cannot be fixed | PaySub's page speaks of 28 days and a "submitted date"; the author infers, without having used the product, that it counts from the subcontractor's own submission, which is not the statutory trigger at subcontract level. Tiercord Learn says a subcontractor's own invoice date "is not a universal substitute"; its free calculator starts from a confirmed owner-level date. How a payee without that date proceeds is not shown | `T-0.1.4`: founder runs both trials with one synthetic subcontract; `T-0.2.3`: share of real open invoices with EV-01 unknown |
| 2 | **Applicability unknown**: the prime contract date and procurement start decide whether Part I.1 applies at all (s. 87.3(4)), and the subcontractor often lacks both | Neither site shows how a payee obtains or records them. Partly answered by the Act itself: a lien holder may require the contract date and the procurement start from the owner or contractor within 21 days (s. 39(1) para. 1.i) `[S: SRC-01]`; the gap is knowing to ask | Same two tasks |
| 3 | **Silent non-payment and the unkept undertaking**: day 35 passes with no payment and no Form 1.2 or 1.3; or a Form 1.2 arrives and the contractor does not refer the matter to adjudication within 21 days | PaySub does not mention notices; Tiercord lists the 21 days, but payee-side monitoring is not shown | Same two tasks |

Two non-feature differences were claimed in the first draft and are weaker than stated:

- **Done-for-you loading** ("all open invoices loaded by us" `[C]`). Tiercord's free trial already includes dedicated onboarding `[S: SRC-06]`. What remains is narrower: someone works out which facts are missing and what to ask for. Whether that is permitted for a non-licensee is `LQ-02`.
- **A lawyer-signed rule table** `[C]`. Still a difference on the evidence seen, and unproven as a reason to buy.

The backup channel (association webinars, lawyers, bookkeepers `[C]`) is already being worked by Tiercord's association kit; PayClock would arrive second with less material. If `T-0.1.4` shows Tiercord already handles candidate 1 for a payee, the product hypothesis is dead (gate G0).

Other names: Levelset (US states only), Siteline (US, custom price), Knowify (USD 99 and 329 per month, no provincial clocks), Osler DIY calculators `[C]`; none reopened by the author. `paysub.app` is an unrelated subscription manager, not the competitor.

## 4. What starts each clock (Ontario, from the primary source)

All from the current consolidation of the Construction Act `[S: SRC-01]`, forms from O. Reg. 303/18 `[S: SRC-02]`, counting from the Legislation Act, 2006 `[S: SRC-04]`. "Sub" is a subcontractor paid by the contractor; "sub-sub" is paid by the sub.

### 4.1 Events

Each event is its own type. No event may stand in for another; in particular the three termination-related facts (EV-09, EV-17, EV-18) are never interchangeable.

| ID | Event | Who witnesses it | Starts |
|---|---|---|---|
| EV-01 | Contractor **gives** proper invoice to owner | Contractor, owner | CLK-04, CLK-05, CLK-08 |
| EV-02 | Owner **receives** proper invoice | Owner | CLK-01, CLK-02 |
| EV-03 | Owner gives Form 1.1 to contractor | Owner, contractor | CLK-05 (branch a) |
| EV-04 | Contractor **receives payment** from owner (full, partial, or of an amount earlier noticed) | Contractor | CLK-03 |
| EV-05 | Contractor **gives** Form 1.2 or 1.3 to the sub. Two dates are recorded: the day given, if known, and the day the sub received it. Timeliness and CLK-06 run from the day given; a notice sent by registered mail is deemed received on the fifth day after mailing, excluding Saturdays and holidays (s. 87(2)) | Contractor; sub sees receipt | CLK-06, CLK-08, CLK-17 |
| EV-06 | Sub receives payment from contractor | Sub | CLK-07; closes CLK-17 |
| EV-07 | Sub last supplies services or materials | Sub | CLK-09, CLK-11 |
| EV-08 | Certificate or declaration of substantial performance **published** (s. 32) | Public | CLK-09 variant a |
| EV-09 | Contract **completed or abandoned** (actual date) | Mixed | CLK-09, CLK-11 |
| EV-10 | Subcontract certified complete (s. 33, Form 10) | Certifier | CLK-09, CLK-11 |
| EV-11 | Prime contract entered into | Owner, contractor | applicability, CLK-13 |
| EV-12 | Owner's procurement process commenced | Owner | applicability |
| EV-13 | Owner publishes Form 6 notice of annual release of holdback | Public | CLK-13 |
| EV-14 | Contractor receives holdback payment | Contractor | CLK-14 |
| EV-15 | Notice of adjudication given; adjudicator agrees or is appointed; documents received; determination communicated | Parties | CLK-12 |
| EV-16 | Sub gives a written s. 39 request | Sub | CLK-15 |
| EV-17 | Contract **terminated**: the actual date of termination | Owner, contractor | CLK-11; CLK-09 fallback |
| EV-18 | Form 8 notice of termination **published** (s. 31(6)). "In time" means no later than 7 days after EV-17 | Public | CLK-09 only. For CLK-11 it is never a trigger; when EV-17 is unknown it only caps it (section 4.2.2) |
| EV-19 | Date of substantial performance stated in the certificate or declaration (s. 32(1) para. 2-3) | Public once published | Splits CLK-09 into variants a and b |

### 4.2 Clocks

| ID | Clock | Trigger | Count | Section |
|---|---|---|---|---|
| CLK-01 | Owner pays contractor | EV-02 | no later than 28 days after | 6.4(1) |
| CLK-02 | Owner's notice of non-payment (Form 1.1) | EV-02 | no later than 14 days after | 6.4(2) |
| CLK-03 | Contractor pays sub after being paid within the 28 days (full: 6.5(1); partial, from the amount paid: 6.5(2)); or after the owner later pays an amount that was the subject of a Form 1.2 (6.5(8)) | EV-04 | no later than 7 days after | 6.5 |
| CLK-04 | Contractor pays sub when the owner has not paid some or all within the 28 days (the backstop) | EV-01 | no later than 35 days after | 6.5(4) |
| CLK-05 | Last day for the contractor's notice to the sub: Form 1.2 (owner did not pay) or Form 1.3 (dispute) | (a) EV-03: 7 days after; (b) no owner notice: before the 35-day period expires | 6.5(5)-(7) |
| CLK-06 | Contractor's undertaking in Form 1.2 to refer to adjudication | EV-05, day given | no later than 21 days after | 6.5(5)(a)(iii) |
| CLK-07 | Sub pays sub-sub after being paid | EV-06 | no later than 7 days after | 6.6(1), (2), (5)(a) |
| CLK-08 | Sub pays sub-sub when unpaid; sub's own Form 1.4 or 1.5 | EV-01: 42 days after; notice 7 days after EV-05 or, if none, before day 42 | 6.6(5)(b), (8) |
| CLK-09 | Lien preservation (sub is "any other person"), two variants, section 4.2.2 | see 4.2.2 | 60-day period next following | 31(3), (4), (6), (7) |
| CLK-10 | Lien perfection | the last day on which the lien could have been preserved under s. 31 (the un-extended CLK-09 day, pending L-09) | 90-day period next following | 36(2) |
| CLK-11 | Notice of adjudication on a subcontract | earliest of EV-09, EV-17, EV-10, EV-07. **EV-18 is never the trigger**; with EV-17 unknown it sets only a "no later than" ceiling (4.2.2) | not more than 90 days after | 13.5(3), (3.1) |
| CLK-12 | Adjudication steps: documents 5 days after appointment (13.11); determination 30 days after documents, extendable (13.13); payment 15 days after the determination is communicated (13.19(2)); court filing within 2 years (13.20(2)) | EV-15 | as listed | Part II.1 |
| CLK-13 | Annual holdback: owner publishes Form 6 within 14 days after each contract anniversary; owner pays at least 60 and not later than 74 days after publication | EV-11, EV-13 | as listed | 26(2)-(4) |
| CLK-14 | Contractor pays sub its annual or final holdback | EV-14 | not later than 14 days after | 26(5), 26(8) |
| CLK-15 | Reply to a s. 39(1) request | EV-16 | reasonable time, not over 21 days | 39(1) |
| CLK-16 | Interest starts | the day after the CLK-17 due date, only when CLK-17 is `computed` | prejudgment rate under Courts of Justice Act s. 127, or the contract rate if greater | 6.9 |
| CLK-17 | **Governing due date** of the contractor's payment to the sub: derived, section 4.2.1 | CLK-03, CLK-04, EV-05 | derived | 6.5(1)-(8) |

#### 4.2.1 Which clock is "due" (CLK-17), overdue, and interest

Evaluated per invoice and, where a payment or notice covers only part, per amount. "Within time" means EV-04 on or before the CLK-01 date; if EV-02 is unknown, EV-01 is used and the result is `provisional`. A notice is "in time" if its day given (EV-05) is on or before the CLK-05 date.

| Path | Facts | CLK-17 | Overdue and interest |
|---|---|---|---|
| A | Contractor paid in full within time | EV-04 + 7 (6.5(1)) | Overdue from the day after; CLK-16 runs |
| B | Contractor paid in part within time | Paid portion: EV-04 + 7 (6.5(2), rateable under 6.5(3)). Unpaid remainder: path C | Per portion |
| C | Owner did not pay within the 28 days: nothing paid, or paid late | EV-01 + 35 (6.5(4)). A late owner payment does **not** restart 7 days; 6.5(1) applies only to payment within time | Overdue from the day after day 35 |
| D | Form 1.2 given in time for an amount (owner non-payment, with undertaking) | No due date while unpaid by the owner: "suspended by notice" (6.5(5): subsection (4) does not apply). When the owner pays that amount: EV-04 + 7 (6.5(8)) | Not overdue; no interest computed; CLK-06 is watched |
| E | Form 1.3 given in time for an amount (contractor disputes the sub's entitlement) | No due date for the noticed amount: "disputed by notice" (6.5(6)). Any amount not noticed follows A to C | Not overdue; no interest computed; flag L-05 |
| F | A Form 1.2 or 1.3 given late, or whose day given is unknown and whose receipt is after the CLK-05 date | Computed as A to C, state `provisional`, flag L-05. PayClock does not decide validity | Overdue shown as "subject to L-05"; interest statement blocked |
| G | EV-04 known, EV-01 unknown | "No later than EV-04 + 7", `provisional`: if the owner paid late, path C gives an earlier day that cannot be computed | Not marked overdue before EV-04 + 7 |
| H | Neither EV-01 nor EV-04 known | `not_computable`, missing fact EV-01 | None |

Overdue is true only when CLK-17 is `computed`, an amount remains unpaid, and today is after the CLK-17 date (extended past a holiday). CLK-16 exists only then. Unit tests `UT-17` to `UT-19`.

#### 4.2.2 Lien preservation (CLK-09): two liens, and termination

Section 31(3) has two branches, and s. 31(4) makes them separate liens when a person supplies both before and after substantial performance `[S: SRC-01]`:

| Variant | For supply | Runs from the earliest (variant a) or earlier (variant b) of |
|---|---|---|
| CLK-09a (31(3)(a)) | On or before the date of substantial performance (EV-19) | EV-08 publication; EV-07 last supply; the contract's completion, abandonment or termination; EV-10 |
| CLK-09b (31(3)(b)) | Where there is no certificate or declaration, or after EV-19 | EV-07 last supply; the contract's completion, abandonment or termination; EV-10. EV-08 is **not** a trigger |

- If the sub does not know whether a certificate has been published (EV-08 unknown), every CLK-09 date is an upper bound, shown as "**no later than**", state `provisional`: a publication the sub has not seen makes the true last day earlier, even while the sub is still on site. The contractor must confirm the date and location of publication on written request (s. 39(4)); PayClock offers that request as a template.
- Termination for the lien clock: if Form 8 was published in time (EV-18 no later than 7 days after EV-17), the termination date "for the purposes of this section" is the first publication date (s. 31(7)). If Form 8 was published late, not at all, or EV-18 is unknown, s. 31(7) does not apply on its terms and the engine uses the actual date EV-17 (the earlier, safer day) with flag L-11. If EV-18 is known and EV-17 is not (ceiling rule): a notice of termination is published "after a contract is terminated" (s. 31(6)), so the actual termination is on or before EV-18 and may be much earlier. The termination branch itself is not computable (missing fact EV-17), and no exact date is shown. What is shown, for both CLK-09 and CLK-11, is a ceiling: "**no later than**" the earliest of (EV-18 + the count) and the dates from the other known triggers, state `provisional`, bound `no_later_than`, flag L-11, with the text "the actual termination date is missing and can only make this earlier". Publication is used only as an upper limit on the unknown termination date, never as the termination date; if termination in fact followed publication the ceiling errs early, the safe direction. Worked count: EV-18 2026-09-15, EV-17 unknown, EV-07 2026-09-16. CLK-11 ceiling from EV-18: 15 remaining days of September (16th to 30th) + 31 of October + 30 of November + 14 of December = 90, so 2026-12-14; from EV-07 it would be 2026-12-15; the earlier governs: no later than 2026-12-14. A date of 2026-12-15 would be one day later than the facts allow and is never shown.
- The deeming in s. 31(7) is confined to s. 31. Section 13.5(3) and (3.1) use "the date on which the contract is ... terminated" with no deeming, so CLK-11 always uses EV-17.

Points the brief or the chat had differently, recorded as departures:

1. The chat's "28 din, 14 din notice" `[C]` are the owner's clocks (CLK-01, CLK-02). A sub is paid under CLK-17. The sub's own invoice to the contractor starts no statutory clock `[S: SRC-01]`.
2. The 14-day notice is given by the owner, not sent by the sub. The sub *receives* Form 1.2 or 1.3. The brief's "notice of intention" template `[C]` is not among the forms in O. Reg. 303/18 `[S: SRC-02]` and is dropped.
3. Section 6.6(10) lets a sub "who is required to make payments" ask the contractor for the EV-01 date. A sub with no sub-subs has no such express right; s. 39(1) gives a lien holder a state of accounts, the contract date and the procurement start within 21 days `[S: SRC-01]`. Which request fits is a lawyer question (section 6).
4. Since 2026-01-01 an invoice is deemed proper unless the owner notifies the deficiency within 7 days (s. 6.1(2)) `[S: SRC-01]`; the brief did not record this.

### 4.3 Counting rule `[S: SRC-04]`

Calendar days. The trigger day is excluded (s. 89(3), (5)). A limit that would expire on a holiday extends to the next day that is not a holiday (s. 89(1)). Holidays (s. 88, re-read on e-Laws on 2026-11-11): Sunday, New Year's Day, Family Day, Good Friday, Easter Monday, Victoria Day, Canada Day, Labour Day, Thanksgiving Day, Remembrance Day, Christmas Day, Boxing Day and any day proclaimed by the Governor General or Lieutenant Governor (s. 88(2)); the Monday after a New Year's Day that falls on a Sunday (s. 88(3)); July 2 when July 1 is a Sunday (s. 88(4)); the Monday after a Christmas Day on a Saturday, the Tuesday after one on a Sunday (s. 88(5)). **Civic Holiday (first Monday of August) is not a holiday under s. 88, and Saturday is not a holiday.** The anniversary of 29 February falls on 28 February except in a leap year (s. 89(7)). Limits for registering or filing extend when the office is closed (s. 89(2)). The engine counts only within the years its holiday table covers; a count or extension that reaches any other year is "not computable", never computed against an incomplete table.

Display rule `[P]`:

- Counterparty payment duties (CLK-01 to CLK-08, CLK-13, CLK-14, CLK-17): the extended date is shown, because that is the day s. 89(1) gives. Neither one-day error is safe. A date one day early calls the contractor late a day too soon: the sub may send a reminder or interest claim the contractor can rebut, and an early CLK-05 limit would treat a notice given in time as late. A date one day late hides an overdue invoice and its interest start, and a late CLK-05 limit treats a late Form 1.2 or 1.3 as valid, suspending a due date that is in fact running (both harm the sub). A missing holiday row produces the first error, a wrong extra row (such as Civic Holiday) the second; the holiday table therefore follows s. 88 exactly.
- The user's own rights (CLK-09, CLK-10, CLK-11): whether and how the extension applies is unresolved (L-09). Until the lawyer answers, the **un-extended day is shown as the last day**, the extended day is not output at all, and a note says "may be one day later; ask your lawyer (L-09)". CLK-10 counts from the un-extended CLK-09 day. A rights date shown one day late is the highest-consequence failure, because a lapsed right cannot be restored; the un-extended day is the earlier of the two candidate days, and its cost is that the sub may act up to one day sooner than the statute requires. An earlier "act by" date equals the last day minus a buffer (default 10 days), labelled as not statutory.
- No fixture in this repository fixes a result that depends on an open legal question; such fixtures are marked "pending" and the dependent output is blocked ([execution-plan.md section 7](execution-plan.md#7-test-catalogue)).

### 4.4 Rule versions and transition

| Version | Effective | Content | Computed in MVP |
|---|---|---|---|
| `ON-LEGACY` | Improvements under s. 87.3(1): (a) contract before 2018-07-01; (b) owner's procurement commenced before 2018-07-01; (c) premises subject to a leasehold interest first entered into before 2018-07-01 where the contract or procurement fell on or after 2018-07-01 and before 2018-12-06. Section 87.3(3) carves some 2017 amendments back in where a municipality has an interest | Act as it read on 2018-06-29 (not opened by the author) | No. "Not computed; lawyer required" (L-06) |
| `ON-NOPP` | Prime contract before 2019-10-01, or contract on or after that day whose procurement commenced before it; and every subcontract under such a contract, whenever made (s. 87.3(4)) | No Part I.1 or II.1: CLK-01 to CLK-08, CLK-11, CLK-12, CLK-16, CLK-17 do not exist. Lien clocks as amended | Lien clocks only |
| `ON-2019-10` | 2019-10-01 to 2025-12-31 | ss. 6.2, 6.4 to 6.9 (unchanged since) | Payment clocks for trigger dates in this period. Adjudication and holdback rules of this period were not opened: not computed |
| `ON-2026-01` | From 2026-01-01 (2024, c. 20, Sched. 4; 2025, c. 14, Sched. 2) | Adds s. 6.1(2), s. 13.5(3.1), s. 26 annual release, s. 31(6)-(7), repeal of s. 34(10) | Yes |

The facts that select the regime are therefore EV-11, EV-12, whether the premises are leased and when the lease began, and whether a municipality has an interest. An estimated EV-11 or EV-12 never selects the regime silently `[P]`: if any date within 365 days either side of the estimate would select a different regime (in practice, estimates within a year of 2018-07-01, 2018-12-06 or 2019-10-01), applicability is unknown with L-06 until the date is confirmed; otherwise the regime is selected and every result carries the flag `REGIME_ESTIMATED` and the estimated event ids. The 365-day reach is the author's proposal, for the lawyer to confirm with L-06. The subcontract's own date selects nothing and is not collected. Selection is by the governing date of each clock, never by today's date. Amendments apply to an improvement from the day they come into force (s. 87.4(2)) with these exceptions `[S: SRC-01]`, `[S: SRC-08]`: for a contract entered into before 2026-01-01, the first anniversary to which s. 26 applies is "the second anniversary of the day the contract was entered into that follows" 2026-01-01, and that payment includes all holdback accrued before it (s. 87.4(4)); earlier annual or phased release continues until then (O. Reg. 384/25 s. 1); prescribed project agreements stay under the old s. 26 (s. 87.4(5)); a notice of termination published before 2026-01-01 keeps the old s. 31(6)-(7), which the author has not read (L-11, not computed); a lien tied to a notice of adjudication given before 2026-01-01 keeps the old s. 34(10). The s. 87.4(4) wording admits two readings; the engine computes none until the lawyer chooses (L-07).

### 4.5 How a corrected event changes dependent dates

Events are append-only. A correction adds a new version of the event with a mandatory reason and supersedes the old one. The engine then recomputes every clock that depends on it, at the event's scope (invoice, subcontract, or project), and writes a recomputation record listing, per deadline: old date, new date, rule version, cause event, user, time. Pending reminders for superseded dates are cancelled and re-created. Any template generated from a superseded date is marked stale; if it was marked sent, a lawyer-review flag is raised. Nothing is deleted. Details: `AD-04`, `MH-06`, `S-09`. During the hand-run phase the same effect is produced by procedure `HR-1` to `HR-6`.

Synthetic example. Northline Electric Ltd. (sub) invoices Harbourgate Builders Inc. (contractor) CAD 48,000 for September 2026; nothing has been paid and no notice received (path C). EV-01 is first entered as 2026-10-01 (estimated): CLK-17 = CLK-04 = 2026-11-05. The contractor later confirms 2026-10-08: CLK-17 becomes 2026-11-12, CLK-05(b) 2026-11-12, CLK-08 2026-11-19, CLK-16 2026-11-13; the invoice is no longer overdue on 2026-11-10, and an interest statement drafted on 2026-11-09 is marked stale. Separately, EV-07 corrected from 2026-09-30 to 2026-09-18 moves CLK-09b from 2026-11-29 to 2026-11-17 (act-by 2026-11-19 to 2026-11-07), CLK-11 from 2026-12-29 to 2026-12-17, and CLK-10 from 2027-02-27 to 2027-02-15. Two of those days fall on holidays (2026-11-29 is a Sunday; 2027-02-15 is Family Day); under the display rule they are shown un-extended with the L-09 note.

Termination example. Contract terminated 2026-09-10 (EV-17); Form 8 published 2026-09-15 (EV-18, in time). CLK-09 runs from 2026-09-15: 2026-11-14. CLK-11 runs from 2026-09-10: 2026-12-09. Had Form 8 been published on 2026-09-21 (late), CLK-09 would run from 2026-09-10: 2026-11-09, with L-11.

## 5. Offer, pilot and conversion

### 5.1 What the pilot is

| Question | Answer | Label |
|---|---|---|
| What CAD 99 buys | 30 days. PayClock loads all open invoices supplied (up to 40 `[P]`), returns a dated schedule, sends 4 weekly deadline emails, prepares up to 3 template drafts, holds one 30-minute review call | `[C]` scope; limits `[P]` |
| When paid | In advance, before loading; card payment link or e-transfer | `[P]` |
| Who signs, who pays | The firm's owner signs a one-page pilot agreement; the firm pays | `[P]` |
| Who supplies data | Office manager or controller | `[P]` |
| Delivery before software exists | By hand under controls `HR-1` to `HR-6` ([execution-plan.md section 3.1](execution-plan.md#31-hand-run-controls-phase-0)): lawyer-reviewed rule spreadsheet, every date recomputed by the named Checker, versioned schedule, same-day re-issue and a phone call when a rights date moves earlier | `[C]` "done by hand"; controls `[P]` |
| Precondition | `LQ-02` answered: either the service is confirmed as permitted for a non-licensee in the form offered, or it is delivered under the engaged lawyer's supervision, or it is not offered | `[P]` |
| Refund criterion (objective) | Full refund within 5 business days if PayClock misses either: (a) a schedule covering 100% of supplied invoices within 2 business days of complete data, each invoice dated or marked "not computable: missing fact X"; (b) all 4 weekly emails on the agreed weekday. A business day is Monday to Friday except the holidays in Legislation Act s. 88, Toronto time | `[P]` |
| Brief's success measure | "at least one invoice collected or one notice sent because of the tracker" `[C]`. Measured (section 5.3) but not a refund condition, because "because of" cannot be judged objectively | `[C]`, treatment `[P]` |
| Conversion step | Day 25: the launch plan at CAD 99 per month is offered (section 7). The buyer enters a card in hosted checkout. Recurring billing starts day 31; the CAD 99 pilot fee is credited against the first recurring invoices until used up, which at the launch price is the whole first invoice. No conversion without that explicit step. In Phase 0 the subscription is created by hand in the payment provider's dashboard; in the application it is `MH-13` | `[C]` credit and launch price; mechanics `[P]` |

### 5.2 What the buyer must provide

Every item may be answered "not known"; unknown facts are the measurement in section 3, not an obstacle.

| Level | Fact | Event |
|---|---|---|
| Firm | Aging list of open invoices to general contractors | n/a |
| Project | General contractor; owner if known | n/a |
| Project | Date the prime contract was signed; date the owner's tender or procurement began; whether the premises are leased; whether a municipality is the owner | EV-11, EV-12 |
| Project | Whether a certificate of substantial performance was published, its publication date and the date it certifies | EV-08, EV-19 |
| Project | Whether the prime contract was completed, abandoned or terminated, and when; whether a notice of termination was published, and when | EV-09, EV-17, EV-18 |
| Subcontract | Last day of supply if work has ended; whether the subcontract was certified complete; whether the firm has sub-subs | EV-07, EV-10 |
| Invoice | Date given to the contractor; amount; holdback withheld | n/a (no statutory clock) |
| Invoice | Date the contractor invoiced the owner for that work; date the owner paid the contractor | EV-01, EV-04 |
| Invoice | Any Form 1.2 or 1.3 received: date on the notice, date received, how delivered, amount | EV-05 |
| Invoice | Payments received | EV-06 |

### 5.3 Pilot metric (computable)

**Dated-action rate** `[P]`. Numerator: pilot accounts with at least one dated action in the 30 days. A dated action is (i) a template marked sent with its send date and a copy attached, on an invoice that had a PayClock alert before that date, or (ii) a payment recorded on an invoice at least one day after an alert. An alert is a weekly email or reminder that names that invoice's deadline and has a send record (in Phase 0: the sent email itself, filed under `HR-5`; in the application: a `digest_send` or `reminder` row with status sent). Denominator: accounts that paid CAD 99. Baseline: number of written reminders or notices the firm sent in the previous 30 days, asked at onboarding. Target: 60% of pilots `[P]`. Days-to-collect is recorded but 30 days is too short to judge it.

## 6. Dates and templates, not legal advice: what that rests on

The chat requires a lawyer-written disclaimer `[C]`; the brief requires lawyer review of rule tables before launch `[C]`. A disclaimer does not by itself settle either of the two rules below, which the author read on 2026-11-10.

**Legal services** `[S: SRC-16]`. Under the Law Society Act a person provides legal services by conduct "that involves the application of legal principles and legal judgment with regard to the circumstances or objectives of a person" (s. 1(5)), including giving advice on a person's legal rights and selecting or drafting, on a person's behalf, "a document that affects the legal interests, rights or responsibilities of a person" (s. 1(6) paras. 1, 2.vi). Only a licensee may provide legal services in Ontario (s. 26.1(1)); the exemptions in s. 1(8) cover a corporation's own employees, individuals acting for themselves, and classes prescribed by by-law (by-laws not read). Honest position: a schedule made by hand for one firm from that firm's facts, and a request letter drafted for it, by a founder who is not a licensee, sits close to that definition whether or not money changes hands. Self-serve software in which the customer enters facts and a published rule is applied is a different activity and is what the two competitors describe themselves as; that is the author's reading, not advice. The author cannot conclude that the Phase 0 service is permitted.

**Commercial electronic messages** `[S: SRC-15]`. CASL prohibits sending a commercial electronic message unless the recipient has consented, expressly or impliedly, and the message identifies the sender, gives contact information valid for at least 60 days, and sets out an unsubscribe mechanism (s. 6(1)-(3), s. 11(1)). Consent is implied where the recipient "has conspicuously published" the address without a statement refusing unsolicited messages and the message is relevant to the person's business role (s. 10(9)(b)). Honest position: an address taken from the firm's own website or a public association directory may meet that test; an address supplied by a contact-data tool `[C]` does not show conspicuous publication and is not used for email. Phone calls are outside what the author read.

| ID | Question for the lawyer, in writing, before the gated step | Gates |
|---|---|---|
| LQ-01 | Does the outreach in section 9 meet CASL: implied consent under s. 10(9)(b) for each address source, the identification and unsubscribe wording, and record-keeping? | First message, `T-0.2.1` |
| LQ-02 | Is preparing a per-firm deadline schedule and draft requests, free or paid, the provision of legal services under Law Society Act s. 1(5)-(6)? If so, can it be delivered under the lawyer's supervision or name, and at what cost? Is the self-serve application outside the definition? | First free report, `T-0.2.3`; first paid pilot, `T-0.3.1` |
| LQ-03 | What liability cap, disclaimer and insurance should the pilot agreement and terms carry, and what does errors-and-omissions cover cost? | First paid pilot, `T-0.3.1` |

If LQ-02 is answered "yes, and it cannot be supervised", Phase 0 changes to interviews plus a demonstration on synthetic data, and gate G1 is re-based on signed pilot commitments for the application; the stop rule is then re-computed.

Lawyer-required points during operation (a lawyer licensed in Ontario; PayClock does none of this itself):

| ID | Lawyer review required for |
|---|---|
| L-01 | Every rule version before it is used with a customer; signed memo (`T-0.1.3`, `T-1.1.4`) |
| L-02 | Disclaimer, terms and pilot agreement |
| L-03 | Wording of each template (payment reminder, EV-01 date request, s. 39(1) request, s. 39(4) publication request, interest statement, lawyer handoff pack) |
| L-04 | Any claim for lien, certificate of action, written notice of lien or notice of adjudication. PayClock gives the date and a fact summary only |
| L-05 | Whether a received Form 1.2 or 1.3 is valid and in time, and what follows an unkept undertaking |
| L-06 | Applicability when EV-11 or EV-12 is unknown or near 2018-07-01, 2018-12-06 or 2019-10-01; leased premises; municipal interest; project agreements; federal property |
| L-07 | The two readings of s. 87.4(4); holdback release where a lien exists |
| L-08 | Tiers below sub-sub (s. 6.6(11) says "with necessary modifications"; no day count is stated) |
| L-09 | Holiday and office-closure extension of lien and adjudication limits, and the day from which CLK-10 counts. The interest rate when no proceeding exists: the prejudgment rate is defined by "the quarter in which the proceeding was commenced" (Courts of Justice Act s. 127(1)) `[S: SRC-14]`, and s. 6.9 does not say which quarter applies before any proceeding |
| L-10 | Any action already sent on a date later superseded |
| L-11 | Termination: Form 8 published late, not published, or publication unknown; a notice of termination published before 2026-01-01; a disputed termination (s. 31(8)) |

## 7. One paying account, one billable unit, the prices

- **One paying account** `[P]`: one subcontractor legal entity with one workspace, a payment method on file, and an active subscription whose first recurring invoice has been issued and settled (by payment or by the pilot credit). A pilot payer is not yet a paying account.
- **One billable unit** `[P]`: one account-month.

Prices in the brief `[C]`: the chat gives tiers of CAD 59 / 129 / 299; the pricing block gives a launch price of CAD 99, a minimum of 39 and a maximum of 349; the week-4 target is "3 paying at CAD 99" and the gate "CAD 300 MRR"; the assumed revenue per account is CAD 99.

Reconciliation `[P]`: these agree if accounts start on a **single launch plan at CAD 99 per month** and tiers come later. The base case follows that reading: every converter is offered CAD 99 per month (60 open invoices, 3 seats `[P]`), so revenue per account is 99 with no mix assumption, 3 accounts give CAD 297 against the brief's "CAD 300 MRR", and the CAD 99 pilot credit is used up by the first recurring invoice. The pilot price equals one month at the launch price.

Tiers, when introduced after the application pilot `[P]`:

| Tier | CAD/month `[C]` | Proposed limits `[P]` |
|---|---|---|
| Starter | 59 | 15 open invoices, 1 seat |
| Pro | 129 | 60 open invoices, 3 seats, holdback ledger |
| Business | 299 | Unlimited, 10 seats, viewer seats for lawyer and bookkeeper |

Revenue per account then stays near 99 only with a mix such as 60% Starter, 33% Pro, 7% Business and nobody on annual billing: 0.60 x 59 + 0.33 x 129 + 0.07 x 299 = 98.90 `[A]`; each 10 points of accounts on annual billing lowers it by 1.5%. The minimum of 39 and maximum of 349 `[C]` are not used. The optional CAD 25 per lawyer-reviewed notice `[C]` is excluded from all figures (no partner firm exists).

Usage behind the cost notes `[C]`: 30 extractions a month at CAD 1.50 is 0.05 each; 40 messages at 1.50 is 0.0375 each; support CAD 6 for 5 minutes implies CAD 72 per hour. "Other 3" is the quarterly legal review amortised per account; at CAD 700 per review `[C]` that is 233.33 per month, covered only from 78 accounts (233.33 / 3). Below that the base case understates cost by up to CAD 233 per month.

## 8. Unit economics (CAD, per month unless stated)

One CAC definition used everywhere: **cash spent on acquisition per converted paying account**, excluding founder time, which sits in the founder line.

### 8.1 Cost categories

| Category | Base | Label |
|---|---|---|
| Startup, one-time cash | 1,500 (legal review 700, tools and data 300, hosting and messaging 150, webinar and travel 350). The brief also gives a second 30-day budget of 1,200; the two are not reconciled there, the larger is used | `[C]` |
| Startup, non-cash | 110 development hours x CAD 100 = 11,000 `[C]`; not added to cash while the founder builds, to avoid counting founder time twice. This repository's own task estimates total 294-443 hours ([execution-plan.md section 5](execution-plan.md#5-estimate-summary)), CAD 29,400-44,300 at the same rate `[A]`; unreconciled with the brief | `[C]` + `[A]` |
| Fixed monthly excluding founder | 900 | `[C]` |
| Founder compensation | 6,000 | `[C]` |
| Variable per account | AI 1.50 + API 0.50 + hosting 1.50 + storage 0.30 + messaging 1.50 + support 6.00 + other 3.00 + payment (2.9% x 99 + 0.30 = 3.17) = 17.47 | `[C]` |
| Initial acquisition (CAC) | 350 | `[C]` |
| Churn replacement | 3.5% x 350 = 12.25 per account-month | `[C]` |
| Not in any figure (missing inputs) | Errors-and-omissions insurance and any liability reserve (`LQ-03`); the lawyer's answers to LQ-01 to LQ-03 and any supervision fee beyond the CAD 700 `[C]`; the Checker's time in Phase 0 (20-33 hours, non-cash) | none |

### 8.2 Base case

| Result | Arithmetic | Value |
|---|---|---|
| Gross profit per account | 99 - 17.47 | 81.53 (82.4%) |
| Payback | 350 / 81.53 | 4.29 months |
| Lifetime value | 81.53 / 0.035 | 2,329 |
| Contribution after churn replacement | 81.53 - 12.25 | 69.28 |
| Break-even without founder | 900 / 69.28 = 12.99 | 13 accounts |
| Break-even with founder | 6,900 / 69.28 = 99.60 | 100 accounts |

These match the chat ("Margin 82%. Break-even 13 (100)") `[C]`.

### 8.3 Downside case `[A]`

Inputs: everyone pays CAD 59 (the price both competitors list); reply 4%; meeting 45%; meeting-to-pilot 15% (the stop threshold); pilot-to-paying 40%; churn 6%; lead cost CAD 1.50 per prospect (CAD 150 per 100 `[C]`).

| Result | Arithmetic | Value |
|---|---|---|
| Variable cost | 17.47 - 3.17 + (2.9% x 59 + 0.30 = 2.01) | 16.31 |
| Gross profit | 59 - 16.31 | 42.69 (72.4%) |
| Paying accounts per prospect | 0.04 x 0.45 x 0.15 x 0.40 | 0.00108 |
| CAC | 1.50 / 0.00108 | 1,389 |
| Payback | 1,389 / 42.69 | 32.5 months, against a lifetime of 1 / 0.06 = 16.7 months |
| Contribution after churn replacement | 42.69 - 0.06 x 1,389 | -40.64: no break-even exists |

### 8.4 Funnel from distinct reachable prospects

The chat's funnel `[C]`: 300 -> 21 -> 9-10 demos -> 2-3 customers (reply 7%, meeting 45%, close 25%). The brief does not say whether "customers" are pilots or monthly accounts, while its weekly plan targets 5 pilots and 3 paying `[C]`. Reading used here `[A]`: close 25% is meeting to signed pilot; pilot to paying is 60% (3 of 5).

| Stage | Per 300 prospects | Rate |
|---|---|---|
| Replies | 21.00 | 7% `[C]` |
| Meetings, each yielding a free report `[A]` | 9.45 | 45% `[C]` |
| Paid pilots | 2.36 | 25% `[C]` |
| Paying accounts | 1.42 | 60% `[A]` |

Paying accounts per prospect: 0.07 x 0.45 x 0.25 x 0.60 = 0.004725. Cash check on CAC: CAD 450 of lead cost per 300 prospects / 1.4175 = 317; the brief's 350 is used.

**Distinct reachable prospects: unknown.** No member count was found on the association pages opened (`SRC-12`); a search summary of "over 500" ECAO firms (2022) is secondary and unconfirmed. The CASL position in section 6 shrinks the emailable pool to firms with a conspicuously published address. `T-0.1.1` counts the list. What the arithmetic requires:

| Target | Prospects needed |
|---|---|
| 20 free reports (the stop-rule sample) | 20 / (0.07 x 0.45) = 635 |
| 13 paying accounts (break-even without founder), ignoring churn | 13 / 0.004725 = 2,752 |
| 100 paying accounts (with founder), ignoring churn | 100 / 0.004725 = 21,165 |

Stated plainly: at one founder's 100 new prospects a week `[C]`, 433 a month yield 2.05 paying accounts a month; with 3.5% churn the account base cannot exceed 2.0475 / 0.035 = 58.5. **Cold outreach by one founder cannot reach the 100 accounts that cover founder compensation**, and a pool of 1,500 `[A]` would yield 7 accounts in total, below the 13 needed even without it. Break-even needs the backup channel, for which the brief gives no rates (missing input) and where Tiercord is already present (section 3).

### 8.5 Cash during the ramp (base case)

Month 1 is December 2026 `[P]`: outreach starts; reports and pilots are delivered by hand. The gates decide by day 125 (section 10), early in month 5; the application is built in months 5 to 8 only if they pass (294-443 hours beside continuing sales), and every account is served by hand until then. The table below does not depend on when the application arrives; the hand-service hours it implies are in section 9. Lags: reply 1 week, report 2 weeks, pilot 3 weeks (21 days `[C]`), paying 3 weeks plus 30 days. Recurrence: accounts(t) = accounts(t-1) x 0.965 + new. Revenue = accounts x 99 + pilots x 99 - new x 99; the last term is the pilot credit, which at the launch price is consumed by the first recurring invoice. Acquisition = 2.0475 x 350 = 717.

| Month | Prospects | Pilots | New paying | Accounts | Revenue | Variable | Acquisition | Fixed + startup | Net | Cumulative | Cumulative with founder |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 433 | 1.05 | 0.00 | 0.00 | 104 | 0 | 717 | 2,400 | -3,013 | -3,013 | -9,013 |
| 2 | 433 | 3.41 | 0.65 | 0.65 | 338 | 11 | 717 | 900 | -1,290 | -4,303 | -16,303 |
| 3 | 433 | 3.41 | 2.05 | 2.68 | 400 | 47 | 717 | 900 | -1,263 | -5,566 | -23,566 |
| 4 | 433 | 3.41 | 2.05 | 4.63 | 594 | 81 | 717 | 900 | -1,104 | -6,670 | -30,670 |
| 5 | 433 | 3.41 | 2.05 | 6.52 | 780 | 114 | 717 | 900 | -950 | -7,620 | -37,620 |
| 6 | 433 | 3.41 | 2.05 | 8.34 | 960 | 146 | 717 | 900 | -802 | -8,422 | -44,422 |
| 7 | 433 | 3.41 | 2.05 | 10.09 | 1,134 | 176 | 717 | 900 | -659 | -9,081 | -51,081 |
| 8 | 433 | 3.41 | 2.05 | 11.79 | 1,302 | 206 | 717 | 900 | -521 | -9,601 | -57,601 |
| 9 | 433 | 3.41 | 2.05 | 13.42 | 1,464 | 234 | 717 | 900 | -387 | -9,989 | -63,989 |
| 10 | 433 | 3.41 | 2.05 | 15.00 | 1,620 | 262 | 717 | 900 | -259 | -10,247 | -70,247 |
| 11 | 433 | 3.41 | 2.05 | 16.52 | 1,771 | 289 | 717 | 900 | -135 | -10,382 | -76,382 |
| 12 | 433 | 3.41 | 2.05 | 17.99 | 1,916 | 314 | 717 | 900 | -15 | -10,397 | -82,397 |

- **Cash trough without founder compensation: CAD 10,397 at month 12**; month 13 is the first positive month (+101). Adding the brief's valued development cost gives 21,397; adding this repository's estimate gives 39,797 to 54,697.
- **With founder compensation: -82,397 at month 12, -116,194 at month 18, and no trough.** At the 58.5-account ceiling the business earns 58.5 x 81.53 - 717 - 900 = 3,153 a month before founder pay, CAD 2,847 short of 6,000.
- Twelve months of this ramp contact 5,200 prospects. If the pool is 1,500 `[A]`, outreach ends in month 4, accounts peak at 6.6 in month 6, and cumulative cash is -12,850 at month 18 and falling.
- Downside case, same model: 0.47 new accounts a month, 3.68 accounts at month 12, cumulative -18,293 at month 12 and -26,033 at month 18 (-134,033 with founder), still falling.

### 8.6 The buyer's side `[C]`, all modelled

A sub with CAD 3M revenue and receivables at 67 days: collecting 10 days sooner frees 3,000,000 / 365 x 10 = CAD 82,192; at a 9% line of credit that is 82,192 x 0.09 / 12 = CAD 616 a month. No customer has reported either figure.

## 9. Go-to-market plan

**Ideal customer profile.** Ontario electrical or mechanical subcontractor, 5-50 employees, CAD 1M-15M revenue, commercial or institutional work for general contractors, 5 or more open invoices, at least one over 45 days `[C]`. Trigger: an invoice passes 45 days; a Form 1.2 or 1.3 arrives; the firm's lawyer mentions a missed lien window; the 2026-01-01 amendments `[C]`. Disqualified: residential-only renovators `[C]`; already using Tiercord or PaySub; billing under CAD 1M (Tiercord Starter at 59 offers more) `[P]`; work mainly under pre-2019-10-01 prime contracts or on federal property `[P]`.

**Named roles.** Feels the pain: office manager or controller. Signs and pays: owner. Can block: the owner (fear of upsetting the general contractor), the firm's lawyer, the bookkeeper. Supplies data: office manager or controller.

**Prospect list.** Sources: ECAO member directory, MCA Ontario and Toronto lists, Toronto Construction Association directory `[C]`. Count: unknown (section 8.4). Build (`T-0.1.1`): transcribe firm, trade, city, website; for email, record only an address published on the firm's own site or in the directory, with the page address and the date seen, and note any "no unsolicited email" statement; firms with no such address are phone-only; remove duplicates across lists by normalised firm name and domain; mark disqualifiers; record the final distinct count and the emailable count. Cost about CAD 150 per 100 prospects `[C]`.

**Channel and sequence.** Cold email plus phone `[C]`, after `LQ-01`. Day 0 email; day 2 call to the office line asking for whoever does receivables `[C]`; day 5 follow-up email; day 12 last note. An unsubscribe is honoured the same day and logged; no further message of any kind goes to that address. Volume: 100 new prospects and 30 calls a week `[C]`.

**Message (synthetic).** Bracketed items are filled per prospect; the footer is on every message.

> Subject: the 35-day date on your [Company] invoices
>
> Hi [Name], under Ontario's Construction Act your general contractor has 7 days to pay you after the owner pays it on time, and otherwise 35 days from the day it invoiced the owner, unless it gives you a notice of non-payment. You may not be able to date either from your own records, because both start from events at the contractor's level.
>
> I am preparing, by hand, a free dated schedule for 20 Ontario electrical and mechanical subs: each open invoice with the date it becomes overdue under the Act, the last days for adjudication and lien steps, and which facts are missing to work them out. I would need your aging list and whatever you know, per project, of: when the prime contract was signed, when your GC billed the owner, and your last day on site. "Not known" is a useful answer. If the schedule helps, a 30-day pilot is CAD 99: I keep it current and email you each week. Dates and templates only, not legal advice; your lawyer decides any lien or adjudication step.
>
> [Sender name], [business name], [mailing address], [phone], [email]. You are receiving this because [Company]'s address is published at [page]. Reply "unsubscribe" or use [link] and I will not email you again.

> Follow-up: Hi [Name], one detail from my note: if your GC has not told you when it billed the owner, the statutory due date on your invoice may not be something you, or any software, can work out yet. The free schedule shows which of your invoices are in that position and a wording you can use to ask. Aging list and what you know of the prime contract dates are all I need. Worth 20 minutes this week?
>
> [Sender name], [business name], [mailing address], [phone], [email]. Reply "unsubscribe" or use [link] and I will not email you again.

**Discovery questions** `[C]`: How many invoices are over 45 days right now and what is the total? Who tracks lien and holdback dates and where? Have you ever missed a lien deadline or written off an invoice? Have you used adjudication or sent a formal notice in the last two years? What did your last lawyer letter cost and how long did it take? Added `[P]`: Do you know when your GC bills the owner for your work? Would you send your GC a dated reminder or a request for that date (gate G1c)? Do you use Tiercord, PaySub or their free tools?

**Pilot offer and conversion.** Section 5.1.

**Objections.**

| Objection | Honest answer |
|---|---|
| "Tiercord and PaySub already do this, their trials are free, and Tiercord's includes onboarding." | True as advertised, and for a firm billing under CAD 1M Tiercord's CAD 59 plan offers more. PayClock's claim is narrower: it tells you which dates cannot be known from your records and what to ask for, on a rule table an Ontario lawyer signed. If you already use either tool, you are not our customer. |
| "I do not want to upset my GC by sending notices." `[C]` | The schedule only shows dates. You decide whether anything is sent; nothing leaves PayClock to your GC. |
| "My lawyer handles this." / "Is this legal advice?" `[C]` | It is not legal advice and does not replace your lawyer. It applies published timelines, shows the section, and marks the points where you need your lawyer (section 6). It tells you when to call. |

**First 30, 60 and 90 days** (same rates and lags as sections 8.4 and 8.5; cumulative, expected values):

| By day | Prospects contacted | Replies | Reports | Paid pilots | Paying accounts | Cash spent | Founder hours |
|---|---|---|---|---|---|---|---|
| 30 | 429 | 23.0 | 7.2 | 1.0 | 0.0 | 3,117 | 72 |
| 60 | 857 | 53.0 | 20.7 | 4.4 | 0.6 | 4,734 | 144 |
| 90 | 1,286 | 83.0 | 34.2 | 7.8 | 2.6 | 6,351 | 216 |

Weekly targets: 100 emails, 30 calls, 7 replies, 3.15 meetings and reports, 0.79 pilots. Cash: 1,500 + 900 + 717 in month 1, then 1,617 a month. Founder hours: the brief says 70 per 30 days `[C]`; the composition here `[A]` sums to 72: outreach 35, meetings 10, hand reports at 1.5 hours each 20, pilot emails 7. Over 90 days that is 216 hours, of which outreach is 105 (`T-0.2.1`). Setup tasks in M0.1 (31-49 hours) and the Checker's 20-33 hours are in addition. Each paying account served by hand before the application exists costs about 2 hours a month `[A]`; at 11.79 accounts in month 8 that is about 24 hours a month on top.

The twentieth report arrives near day 58; its pilot answer by day 79; the last pilot ends by day 109 and its first recurring invoice is settled by day 124.

**GTM stop rule.** Channel: drop cold outreach if replies are under 3% after 300 prospects (fewer than 9 against 21 expected). Product: section 10. Pool: if `T-0.1.1` finds fewer than 635 distinct qualified prospects the stop-rule sample cannot be reached by this channel; switch to the backup channel before starting.

## 10. Stop rule

Chat, verbatim (translated from Roman Urdu) `[C]`: "When to stop: if fewer than 3 of 20 free reports pay. Be sure to have a lawyer write the disclaimer." Brief `[C]`: "Stop or pivot if fewer than 3 of 20 subs given a free report pay for a pilot, or if interviews show subs will not act on dates for fear of losing GC work"; invalidation at fewer than 15% agreeing to a paid pilot.

Consistency check. Sample: 20 reports need 635 prospects, about 6.4 weeks of outreach; the last pilot answer arrives near day 79, not within the brief's 30-day roadmap `[C]`. Threshold: 3 of 20 is 15%, below the assumed 25%. If the true rate is 25%, the rule still fires with probability P(X <= 2; n = 20, p = 0.25) = 0.0032 + 0.0211 + 0.0669 = 9.1%. If the true rate is only 10%, the rule passes with probability 32.3%; at 5%, 7.5%. The rule never tests the paying step, the competitor, or the brief's own second condition.

Proposed revision `[P]` (this changes the chat's rule; it is not the chat's rule):

| Gate | Test | Stop if | Decided by |
|---|---|---|---|
| G0 | `T-0.1.4`: founder's own trial of Tiercord and PaySub with the synthetic subcontract | Tiercord dates a payee's invoice with EV-01 unknown and prompts the request: stop the product | Day 14 |
| G1 | The chat's rule, unchanged | Fewer than 3 of 20 reports become paid pilots | Day 79 |
| G1b | Wedge evidence from the same 20 reports `[P]` | Fewer than 8 of 20 firms have at least one open invoice with EV-01 or applicability unknown. The brief's week-1 gate was "8 of 15" on a different question `[C]`; this threshold is the author's | Day 58 |
| G1c | The brief's second condition, given a number `[P]` | 12 or more of 20 firms say they would not send their GC a dated reminder or a request for the EV-01 date | Day 58 |
| G2 | Conversion of **every** pilot that came from the 20 reports (n is whatever G1 produced, at least 3) | Fewer than n / 3, rounded up, become paying accounts: 1 of 3; 2 of 4, 5 or 6; 3 of 7, 8 or 9 | Day 124 |
| G3 | Time | No decision by day 125: stop | Day 125 |

G2's data exists before G3: the last of the 20 reports is answered by day 79, that pilot ends by day 109, and its first recurring invoice is settled or not by day 124. At the assumed rates 20 reports yield 5 pilots on average, but fewer than 5 with probability 41.5%, which is why G2 is defined for any n.

Error rates if every assumed rate is true (pilot 25%, conversion 60%):

| Combination | Probability the business is stopped wrongly |
|---|---|
| G1 alone | 9.1% |
| G1 or G2 | 17.4% |
| G1, G2 or G1b, if half of firms truly have the unknown fact `[A]` | 28.2% (G1b alone: 13.2% at 50%, 41.6% at 40%) |
| All four, if 40% of firms truly would not act `[A]` | 32.3% (G1c alone: 5.7%) |

So roughly one time in three the full set stops a business that meets every assumption; that is the price of testing the wedge and the fear objection on 20 firms. The opposite error: a business with a 10% pilot rate and 20% conversion passes G1 and G2 with probability 12.1%. G1b and G1c have no evidence behind their assumed true rates.

## 11. What buyer evidence would change the decision

- Toward building: 8 or more of 20 firms cannot date their invoices for lack of EV-01 and ask for the request wording; pilots convert at CAD 99 without asking for 59; a lawyer or bookkeeper refers a second firm unprompted.
- Toward stopping: prospects name Tiercord, PaySub or Tiercord's free tools as already in use; firms know their dates and still will not act; pilots pay CAD 99 once and decline a subscription; lawyers report that subs rarely use notices or adjudication even when informed `[C]`.
- Toward a different product: firms want the hand-run schedule but not software (a service, which `LQ-02` may reserve to a lawyer), or general contractors ask for the payer side (Tiercord's ground).

## 12. Open decisions for the founder

| # | Decision | Needed by |
|---|---|---|
| 1 | Accept the change from "pursue" to "validate by hand, then decide" | Before `T-0.2.1` |
| 2 | Name the Ontario construction lawyer; confirm what CAD 700 covers; put LQ-01 to LQ-03 | `T-0.1.3`, `T-0.1.5` |
| 3 | Accept the revised stop rule (G0 to G3) or keep the chat's single rule | Before `T-0.2.1` |
| 4 | Launch at a single CAD 99 plan (section 7) or on the three tiers | `T-0.3.1` |
| 5 | Where the VPS is located; if not in Canada, use `AD-09` hosting | `T-2.1.4` |
| 6 | Name the Checker: a team member other than the person who computes the dates. With a team of one, Phase 0 reports cannot start | `T-0.1.2` |

## 13. Sources and assumptions

Date consulted for every row: 2026-11-10.

| ID | Source | Jurisdiction | Scope used | Access |
|---|---|---|---|---|
| SRC-01 | Construction Act, R.S.O. 1990, c. C.30, e-Laws current consolidation "From January 1, 2026", last amendment 2025, c. 14, Sched. 2. https://www.ontario.ca/laws/statute/90c30 | Ontario | ss. 6.1-6.9, 13.5-13.20, 22, 26-27, 31, 36, 39, 87, 87.3, 87.4; ss. 13.5, 31 and 39 re-read for the review fixes | Page is script-rendered; full text read through the site's own data endpoint. Historical versions not opened |
| SRC-02 | O. Reg. 303/18 (Forms), consolidation 2026-01-01. https://www.ontario.ca/laws/regulation/180303 | Ontario | Forms 1, 1.1-1.5, 6-10, 12 | Open |
| SRC-03 | O. Reg. 264/25 (Adjudications under Part II.1). https://www.ontario.ca/laws/regulation/250264 | Ontario | ss. 19-22. O. Reg. 306/18 seen as revoked 2026-01-01 | Open |
| SRC-04 | Legislation Act, 2006, S.O. 2006, c. 21, Sched. F, ss. 88-89. https://www.ontario.ca/laws/statute/06l21 | Ontario | Holidays (s. 88(2)-(5)), counting (s. 89(1), (3), (5)), 29 February anniversaries (s. 89(7)) | Open; ss. 88-89 re-read on e-Laws (rendered page) on 2026-11-11 for B1 fix round 1 |
| SRC-05 | PaySub home and privacy pages. https://paysub.ca/ | Ontario | Features, prices, subprocessors | Public pages only; no trial account created |
| SRC-06 | Tiercord home, pricing, terms, read-only demo. https://tiercord.ca/ , https://tiercord.ca/pricing | Canada | Features, prices, trial terms, coverage, terms | Public pages and read-only demo; no trial account created |
| SRC-07 | Tiercord Learn: Ontario page, guides, free tools, associations page; edition 29 October 2026. https://learn.tiercord.ca/provinces/ontario , https://learn.tiercord.ca/tools , https://learn.tiercord.ca/partners | Ontario | Vendor's description of clocks; free tools; association material | Open; a vendor source, not law. Tools read as page text, not operated |
| SRC-08 | O. Reg. 384/25 (Transitional Matters). https://www.ontario.ca/laws/regulation/250384 | Ontario | s. 1, Schedule 1 | Open |
| SRC-09 | OWASP ASVS 5.0.0, requirement list. https://github.com/OWASP/ASVS/tree/v5.0.0 | n/a | Requirements cited in TRD | Open |
| SRC-10 | WCAG 2.2. https://www.w3.org/TR/WCAG22/ | n/a | Criteria cited in design | Open |
| SRC-11 | ODACC annual report page. https://odacc.ca/en/annual-report/ | Ontario | None | Page opened; the 2026 report PDF could not be read as text here. No figure used |
| SRC-12 | ECAO, MCA Ontario, TCA sites. https://www.ecao.org/ | Ontario | Member count sought | No count found on pages opened |
| SRC-13 | Sources in the brief's research record (Osler, BC government, BCCA, Levelset, Siteline, Knowify) | Mixed | As quoted, with the brief's status | Not reopened by the author |
| SRC-14 | Courts of Justice Act, R.S.O. 1990, c. C.43, ss. 127-128. https://www.ontario.ca/laws/statute/90c43 | Ontario | Definition of prejudgment interest rate; quarterly table | Open. The published rate table itself was not opened; no rate value is used |
| SRC-15 | Canada's anti-spam legislation, S.C. 2010, c. 23, ss. 6, 10(9), 11. https://laws-lois.justice.gc.ca/eng/acts/E-1.6/ | Canada | Consent, identification, unsubscribe | Open. Regulations not read |
| SRC-16 | Law Society Act, R.S.O. 1990, c. L.8, ss. 1(5)-(8), 26.1. https://www.ontario.ca/laws/statute/90l08 | Ontario | Definition of providing legal services; prohibition; exemptions | Open. Law Society by-laws not read |
| SRC-17 | Supabase documentation, database backups. https://supabase.com/docs/guides/platform/backups | n/a | Daily backups on Pro (7 days); point-in-time recovery is an add-on | Open. Add-on price not read |

Assumptions preserved: all unit-economics inputs `[C]` are model assumptions, not findings; launch-plan reading of the prices; pilot-to-paying 60%; one report per meeting; pool size; plan and tier limits; act-by buffer; founder-hour composition; true rates behind G1b and G1c; that Tiercord's and PaySub's products behave as their public pages say.
