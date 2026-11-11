# CLAUDE.md — PayClock

Read [AGENTS.md](AGENTS.md) first; it is canonical. This file adds only what is specific to this product.

## The buyer's workflow

An Ontario electrical or mechanical subcontractor's office manager keeps an aging list of invoices to general contractors. The owner of the firm pays for PayClock. The office manager loads the list, records what is known about each project (prime contract date, when the contractor invoiced the owner, last day of supply, notices received), and gets per invoice: the date the contractor's payment duty falls due, when interest starts, the last days for adjudication and lien steps, and what fact is missing. They send any reminder or request themselves and call their lawyer for lien or adjudication steps.

The key fact of the domain: a subcontractor's own invoice starts no statutory clock. Payment clocks run from the contractor giving its proper invoice to the owner (35 days) or from the contractor being paid on time (7 days); which one governs, and what a notice of non-payment does to it, is fixed by the path table for CLK-17. The subcontractor often does not know either date. See [Decision.md section 4](Decision.md#4-what-starts-each-clock-ontario-from-the-primary-source).

## Highest-consequence error

**Late or stale expiry date**: a lien or adjudication last day shown later than the statute allows, or still shown after the event behind it was corrected, so the subcontractor lets an irreversible right lapse. Everything about corrections, supersession and reminders exists to prevent it ([PRD.md section 9](PRD.md#9-highest-cost-user-mistake), [TRD.md 6.2](TRD.md#62-highest-consequence-failure-sequence-late-or-stale-expiry-date)).

## Sensitive data

Invoice amounts, amounts in dispute, names of general contractors and owners, notices of non-payment, evidence emails, staff names and emails. Confidential business data under PIPEDA. Records and files are stored in Canada; the email and payment processors are not, so emails never carry amounts, invoice numbers or contractor or owner names ([TRD.md 8.10](TRD.md#810-subprocessors-and-data-location)). Never in logs, test fixtures, examples or prompts.

## Prohibited shortcuts

- Do not count from the subcontractor's invoice date, or from "today", when the statutory trigger is unknown. Return "not computable" and name the missing fact.
- Do not make any event date mandatory or default it.
- Do not let one event type stand in for another. The actual termination date (EV-17), the Form 8 publication date (EV-18) and completion or abandonment (EV-09) are three facts; adjudication time never runs from publication; with the termination date unknown, publication gives only a "no later than" ceiling.
- Do not show a rights date as final when a trigger is unknown; write "no later than".
- Do not assert in a fixture, or output to a user, anything that depends on an open legal question (L-07, L-08, L-09, LQ-01 to LQ-03). Withhold it and show the flag.
- Do not mark an invoice overdue or compute interest except from CLK-17 in state `computed`.
- Do not send outreach or deliver a report before LQ-01 and LQ-02 are answered in writing.
- Do not edit a deadline, an event or an approved rule version in place.
- Do not compute dates, interest, access or applicability with a model, a spreadsheet formula pasted into the UI, or any code outside `packages/rules`.
- Do not treat a lawyer flag as resolved, or a clock as fine, because nothing is due.
- Do not add a feature that sends anything to a third party.
- Do not encode a day count from a law-firm article, a competitor's page or memory. Use the e-Laws consolidation and record the section.
- Do not claim ASVS or WCAG conformance.
- Do not promise what an unknown input can defeat: no "never miss a deadline", no "the 35-day date on every invoice". Say what PayClock does: dates where the facts allow, the missing fact and a request where they do not.
- Do not describe PayClock as "the only" Canadian tracker, or say PaySub has no notices; PaySub and Tiercord exist and both advertise notices ([Decision.md section 3](Decision.md#3-competitor-gap-the-decisive-question)).

## First verification checks when implementation begins

1. `UT-01` to `UT-04`: day counting, Sunday and holiday extension, Saturday not a holiday.
2. `UT-07`, `UT-20`: unknown upstream date gives "not computable" on payment clocks, with "confirm the GC's proper-invoice date", the request draft and a place to record the reply, while lien and adjudication clocks still compute. `UT-21`: perfection counts from the last preservation day (s. 36(2)).
3. `UT-08`: rule-version selection at 2018-07-01, 2019-10-01 and 2026-01-01.
3a. `UT-15` to `UT-19`: termination against Form 8 publication, the two liens, and due-date paths A to H.
4. `UT-12`: every Phase 0 hand-calculated invoice reproduces exactly.
5. `IT-01`: cross-tenant access returns 404 through API, job, export and file link.
6. `IT-03`, `IT-05`, `IT-07`: a correction is atomic, an out-of-order job cannot restore an old date, and stale actions are marked.

Tests are defined in [execution-plan.md section 7](execution-plan.md#7-test-catalogue). Results of the B1 run (2026-11-11) are in [verification-report-fixing.md section 9](verification-report-fixing.md#9-build-milestone-b1-2026-11-11); `UT-12`, `IT-07` and every test not listed there are `Not run`.
