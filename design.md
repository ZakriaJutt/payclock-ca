# Design brief — PayClock

Labels and IDs: [Decision.md section 0](Decision.md#0-how-numbers-and-claims-are-labelled). Screens: [App-flow.md](App-flow.md). Everything here is proposed. Accessibility statements are a plan to be tested, not a claim of WCAG 2.2 conformance.

## 1. Principles

| ID | Design decision | Why |
|---|---|---|
| DD-01 | A date never appears without its trigger, certainty and section | The user must be able to challenge every date |
| DD-02 | Three certainty treatments: confirmed (solid), estimated (dashed outline, "est."), unknown (empty slot, "needs a fact") | Estimated must never look confirmed |
| DD-03 | Rights clocks (lien, adjudication) are visually heavier than payment clocks and show act-by first, statutory last day second | The irreversible dates dominate |
| DD-04 | State is always text plus icon plus colour | Colour alone is not relied on |
| DD-05 | Superseded values stay visible with the word "Superseded" (visible text and accessible name), an icon and a link to the change; the current value is labelled "Current". Strikethrough may be added but carries no meaning by itself | Corrections are explained, not hidden, for every user |
| DD-09 | Emails name the clock, the date, its certainty and a link; never an amount, an invoice number, or a contractor's or owner's name | Email leaves Canada and sits in inboxes ([TRD.md 8.10](TRD.md#810-subprocessors-and-data-location)) |
| DD-10 | A provisional rights date is always written "no later than <date>" and is never styled as final | An unseen publication can make it earlier |
| DD-06 | Drafts carry a "Draft: not sent" band; sent actions carry date, method and copy | Draft and sent cannot be confused |
| DD-07 | Lawyer-required points use one consistent purple "Lawyer" tag with the L-number | One recognisable signal |
| DD-08 | No celebratory or "all clear" states; the best state is "computed, nothing due in 14 days" | A flag or a blank is never a pass |

## 2. Visual system

- Layout: left navigation (Dashboard, Projects, Import, Rules, Audit, Settings) at 1024 px and wider; top bar with firm name and "Dates and templates, not legal advice". Content column maximum 1120 px.
- Typography: system sans-serif; 16 px body, 14 px table text minimum; dates in tabular figures, written `Tue 17 Nov 2026`, never numeric-only.
- Colour (text on white unless noted):

| Token | Hex | Use | Contrast on white |
|---|---|---|---|
| ink | `#1B1F24` | Text | 16.6:1 |
| muted | `#57606A` | Secondary text | 6.4:1 |
| action | `#0B5CAD` | Links, primary buttons (white text) | 6.7:1 |
| overdue | `#B42318` | Past due / past act-by | 6.6:1 |
| soon | `#8A4B00` | Within 14 days | 6.8:1 |
| lawyer | `#6B3FA0` | Lawyer tag | 7.4:1 |
| neutral chip | `#EAEEF2` with ink text | Not computable, not applicable | 14.2:1 on the chip |

Ratios were computed from the hex values with the WCAG relative-luminance formula; rendered pages are measured in `E2E-07`.

- Components: deadline row; clock card; certainty chip; state chip; lawyer tag; evidence link; diff table; reason field; file drop zone with a button alternative; summary error box; toast with a matching live-region message; modal only for destructive confirmation.
- Responsive: at under 768 px the navigation collapses to a menu, tables become stacked cards with the date first, the clock timeline becomes a vertical list; content reflows at 320 px width without horizontal scrolling except the diff table, which gains a card view.
- Feedback: every save returns a visible result within the page and a status message; long work shows counts, not spinners alone.

## 3. Principal screens

**S-03 Dashboard.** Header: counts "2 past act-by · 3 within 14 days · 6 need a fact". Below, three groups in this order: "Act now" (rights clocks past or within 14 days), "Coming up" (by act-by date), "Needs a fact" (not computable, with the missing fact named and one action, for example "Ask Harbourgate Builders for the date it invoiced the owner"). Each row: date block on the left (weekday, day, month, days left), then invoice number, contractor, amount, clock name, certainty chip, flag tags; whole row is one link.

**S-07 Invoice detail.** Header band: invoice, amount, holdback, contractor, rule version link. Left two-thirds: clock cards in four groups. The first card is the governing due date (CLK-17) with its path in words. A card reads: clock name; big date; "act by" where relevant; "Starts from: contractor gave proper invoice to owner — 8 Oct 2026 — confirmed — evidence: email.pdf"; "Rule: s. 6.5(4), ON-2026-01"; state chip; tags. A not-computable card shows the empty date slot, the missing fact and the action. Right third: events list with "Correct" on each, then actions with draft, sent or stale marks.

**S-09 Recomputation review.** Heading, which receives focus: "Last supply changed from 30 Sep 2026 to 18 Sep 2026 by D. Okafor: 'site diary'. 3 dates changed, 3 moved earlier." Table sorted with earlier-moving rights clocks first: clock, "Was" column (old date, labelled superseded), "Now" column, change in days, direction icon and word. Panels: reminders cancelled and created; actions now stale; flags raised. One button: "Back to invoice".

**S-10 Template.** Left: the document as it will read, with merged facts highlighted and each statutory date footnoted to its trigger. Right: checklist "Before you send" (facts confirmed, lawyer note), then "I sent this" form.

**S-08 Event editor.** Current value and history above; date input with a "Not known" checkbox that disables the date; certainty radio group; evidence upload; reason; a list "These dates will be recalculated".

## 4. Microcopy

- Pending: "Recalculating 6 dates for Lakeshore Clinic Fit-out… You can keep working; this page updates when it is done."
- Recoverable error: "We could not confirm your correction was saved. Nothing has been changed yet. Check status, or try again; your reason and date are still in the form."
- Human approval (mark sent): "You are recording that you sent this interest statement to Harbourgate Builders on 10 Nov 2026. PayClock did not send it. The interest start date rests on a confirmed fact: proper invoice given to the owner on 8 Oct 2026. Have your lawyer review wording you rely on (L-03). Record as sent?"
- Not computable: "We cannot date this yet. The 35 days run from the day your contractor invoiced the owner, and we do not have that date. Ask for it."
- Moved earlier (on screen): "Your lien last day moved 12 days earlier, to Tue 17 Nov 2026. The act-by date has passed. Call your lawyer today (L-04)."
- Moved earlier (email, DD-09): "A lien last day in your PayClock workspace moved earlier, to Tue 17 Nov 2026. Its act-by date has passed. Open PayClock and call your lawyer today."
- Provisional: "No later than Mon 14 Dec 2026. It may be earlier: we do not know whether a certificate of substantial performance has been published. Ask your contractor (it must tell you on written request)."
- Suspended: "Not overdue. Harbourgate Builders gave you a notice of non-payment in time, so the 35-day duty does not apply to this amount for now. Whether the notice is valid is a question for your lawyer (L-05)."

## 5. Evidence, corrections, drafts

- Inspect evidence: every trigger line has an evidence link that opens the file in a side panel beside the clock, with the event's history beneath; no evidence shows "no document attached" rather than nothing.
- Correct a suggestion: imported values and any estimated date are suggestions; "Correct" opens S-08 prefilled; the user changes the value or marks it unknown and gives a reason; the diff follows.
- Drafts versus approved results: clocks are never "approved", they are `computed`, `provisional` or `not computable`; documents are "Draft: not sent", "Sent on …" or "Stale: based on a date that changed"; rule versions show "Signed by counsel on …" or are not visible to tenants at all.

## 6. Accessibility plan (WCAG 2.2 AA criteria read at `SRC-10`)

| Criterion | Screens | Planned behaviour | Manual check (`E2E-07`, `E2E-08`) |
|---|---|---|---|
| 1.3.1 Info and Relationships | S-03, S-07, S-09, S-10 | Real tables and headings; clock cards are labelled regions; "Superseded", "Stale", "Current" and "no later than" are text in the accessible name, not styling | Screen reader reads row headers with each date, and on S-09 reads "was … superseded" and "now …" for one lien date |
| 1.4.1 Use of Color | All chips | Text and icon with every colour | Greyscale screenshot remains readable |
| 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast | All | Tokens in section 2; 3:1 for chip borders and focus ring | Measure each token pair |
| 1.4.10 Reflow | S-03, S-07, S-09 | Card views at 320 px | Zoom to 400% at 1280 px |
| 2.1.1 Keyboard | All; S-06 file drop | Button alternative to drag-and-drop; no keyboard trap in side panel | Complete import and a correction with keyboard only |
| 2.4.3 Focus Order, 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured (Minimum) | S-08, S-09, S-10, modals | Focus enters the panel, returns to the trigger on close; on S-09 focus lands on the heading; on conflict or timeout focus moves to the message; sticky header never covers the focused field | Tab through S-08 with sticky header; trigger a conflict and a timeout |
| 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum) | S-06, row actions | No drag-only function; targets at least 24 by 24 CSS px | Measure smallest control |
| 2.2.1 Timing Adjustable | Session timeout | Warning with "continue" | Wait for warning; extend by keyboard |
| 3.3.1 Error Identification, 3.3.3 Error Suggestion | S-02, S-05, S-06, S-08 | Summary box receives focus; each error names the field and the fix | Submit S-08 without a reason |
| 3.3.2 Labels or Instructions, 1.3.5 Identify Input Purpose | Forms, S-01 | Visible labels; autocomplete tokens on sign-in | Inspect S-01 |
| 3.3.4 Error Prevention (Legal, Financial, Data) | S-08, S-10, S-13 | Review step before correction, mark-sent and deletion; corrections reversible by a further correction | Walk each flow |
| 3.3.7 Redundant Entry | S-02, S-06 | Mapping and firm details are remembered | Re-import with saved mapping |
| 3.3.8 Accessible Authentication (Minimum) | S-01 | Paste and password managers allowed for password and TOTP | Sign in using a password manager |
| 3.2.6 Consistent Help | All | Help link in the same header position | Compare five screens |
| 4.1.3 Status Messages | S-06, S-08, S-09 | Live region announces "Saved; 3 dates changed, 1 moved earlier" and import completion; conflict and timeout are announced as alerts | Screen reader announces without focus change |

Known gap: emailed PDFs of templates are not yet specified as tagged PDFs; status "not met" until `T-4.3.3` decides.
