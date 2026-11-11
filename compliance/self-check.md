# Compliance self-check — PayClock (2026-11-11)

> **This is not legal advice.** It is the business's own reading of primary sources, written down so that anyone can follow it. No lawyer has reviewed it. The owner decided on 2026-11-11 that no lawyer will be hired for now and accepts the remaining risk (section 11). Where a source could not be opened it is said, and the secondary source used instead is labelled.

How to use this file: each legal question the documents raise has its own section with the rule, the sources, a checklist, red lines and a risk level. Templates are in section 8 and are marked "template - adapt". Decisions that change the product are marked `[P]` (owner decision) and are not made here. Labels follow [Decision.md section 0](../Decision.md#0-how-numbers-and-claims-are-labelled).

| § | Question | Was gated on | Risk after this check |
|---|---|---|---|
| 1 | LQ-01: CASL and calls for outreach to Ontario subcontractors | First message, `T-0.2.1` | Low for email if section 1 is followed; low to medium for calls (CRTC rules page not readable) |
| 2 | LQ-02: Law Society Act, legal services, self-serve tools | First free report `T-0.2.3`; first paid pilot `T-0.3.1` | **High** for the hand-run per-firm schedule as written; **medium** for self-serve software |
| 3 | LQ-03: disclaimer, limitation of liability, E&O insurance | First paid pilot, `T-0.3.1` | Medium |
| 4 | L-01 to L-03: lawyer sign-off of rule versions, disclaimer, terms and template wording | Any customer-facing date (`T-0.1.3`, `T-1.1.4`) | Medium (replaced by a two-person check, which needs a named Checker) |
| 5 | L-04 to L-11: points that need the customer's own lawyer | Per record | Unchanged: output stays withheld or flagged |
| 6 | Privacy (PIPEDA): prospect list and customer data | Privacy notice, `T-1.1.4` | Low to medium |
| 7 | Foreign rules | n/a | Low: Ontario-only product; two processors outside Canada |

---

## 1. LQ-01 — CASL: emails and calls to Ontario subcontractors

Original question (kept as written in [Decision.md section 6](../Decision.md#6-dates-and-templates-not-legal-advice-what-that-rests-on)): *Does the outreach in section 9 meet CASL: implied consent under s. 10(9)(b) for each address source, the identification and unsubscribe wording, and record-keeping?*

### 1.1 The rule in plain English

| Rule | Section and short quote | Source (opened 2026-11-11) |
|---|---|---|
| A commercial electronic message (CEM) is an email whose purpose, or one of whose purposes, is to encourage taking part in a commercial activity. A sales email to a subcontractor is a CEM | CASL s. 1(2) | [CASL, S.C. 2010, c. 23](https://laws-lois.justice.gc.ca/eng/acts/E-1.6/page-1.html), current to 2026-10-19 |
| You may send a CEM only with consent, express or implied, and in the required form | s. 6(1)(a): the recipient "has consented to receiving it" | same |
| Every CEM identifies the sender, gives contact details and has an unsubscribe mechanism; the contact details must work for 60 days | s. 6(2)(a)-(c), s. 6(3) | same |
| Implied consent exists where the person "has conspicuously published" the address, did not say they refuse unsolicited messages, and the message is relevant to their business role | s. 10(9)(b) | [CASL page 2](https://laws-lois.justice.gc.ca/eng/acts/E-1.6/page-2.html) |
| The unsubscribe must cost nothing, point to an email or web address, stay valid 60 days, and be honoured "no later than 10 business days after the indication has been sent" | s. 11(1)-(3) | same |
| Whoever relies on consent must prove it | s. 13: the sender "has the onus of proving it" | same |
| Penalty ceiling per violation | s. 20(4): "$10,000,000 in the case of any other person" ($1M for an individual) | [CASL page 3](https://laws-lois.justice.gc.ca/eng/acts/E-1.6/page-3.html) |
| Identification must include the business name, a mailing address, and a phone number, email address or web address; information and unsubscribe set out "clearly and prominently"; unsubscribe "able to be readily performed" | Electronic Commerce Protection Regulations (CRTC), SOR/2012-36, ss. 2(1), 3(1), 3(2) | [SOR/2012-36](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2012-36/FullText.html), current to 2026-10-19 |
| A request for express consent (for example on a call) must name who asks and say that consent can be withdrawn | SOR/2012-36 s. 4 | same |
| Live phone calls are outside CASL s. 6 | s. 6(8)(a): "an interactive two-way voice communication between individuals" | CASL page 1 |
| Calls to businesses are outside the National Do Not Call List rules, but the caller must still keep its own do-not-call list and identify itself | DNCL operator, Exemptions page: "The National DNCL Rules do not apply to telemarketing calls made to businesses."; every telemarketer "is required to maintain such a list" (page dated 2018-04-09) | [lnnte-dncl.gc.ca exemptions](https://lnnte-dncl.gc.ca/en/Organization/Exemptions) |
| Exempt calls still follow the CRTC Telemarketing Rules (registration with the DNCL operator, identification, calling hours, internal list kept up to date) | **Primary page blocked**: https://crtc.gc.ca/eng/trules-reglest.htm returned a browser security check on 2026-11-11 and was not read. Secondary, labelled: search summaries of CRTC pages and CRTC bulletin 2009-282 say exempt calls must comply with the Telemarketing Rules, that telemarketers register before calling, and that a do-not-call request is added to the internal list within 14 days | Secondary (search results, not opened) |
| Product emails to customers' own users (sign-in, invitation, password reset) are not CEMs when they only give access to the account; reminders and digests are exempt from consent only (s. 6(6)(d), (f)) and still need the s. 6(2) form if they are CEMs | s. 6(6): consent rule does not apply to messages that solely "facilitates, completes or confirms a commercial transaction" and similar | CASL page 1 |

### 1.2 What the business must do (checklist)

1. **Build the list by source** (`T-0.1.1`): for each email address, record the page where it is published (firm's own website or an association directory), the date seen, and whether the page or directory says "no unsolicited email" or forbids use for solicitation. If it does, the address is phone-only.
2. **Use only conspicuously published addresses** for the first email. Never use an address from a contact-data or enrichment tool, a guessed pattern (`firstname@`), or a purchased list.
3. **Check relevance**: the message is about receivables and payment dates; send it to an owner, office manager, controller, accounts or general office address of an electrical or mechanical contractor. Do not send it to unrelated roles (for example a field estimator's personal address).
4. **Every email carries the footer** in section 8.3: business name, sender name, mailing address, phone and email, the reason the person is receiving it (the page address), and a one-step unsubscribe (reply "unsubscribe" or a link). Keep the reply address and link working for at least 60 days after the last send.
5. **Honour an unsubscribe the same day** (the law allows 10 business days; the plan's own rule is the same day), add it to the suppression list, and never send any further message of any kind to that address. Log: address, date, how received.
6. **Keep records for proof of consent** (s. 13): the list with source page and date seen, every message sent with date, and the suppression list. Keep them for 3 years after the last message `[P]` (the period is the business's choice; CASL does not state one in the sections read).
7. **Calls**: before the first call, register with the National DNCL operator as a telemarketer if the CRTC rules require it for exempt calls (secondary sources say yes; check https://lnnte-dncl.gc.ca when the page can be read). At the start of each call say who you are and which business you call for (script in section 8.5). Keep an internal do-not-call list; add a "do not call" request the same day. Call only on business days in office hours `[P]`.
8. **Express consent on a call**: if the person says "email me", record the name, date and wording and that you said they can withdraw at any time (SOR/2012-36 s. 4). That is express consent and lets you email that person even if their address was not published.
9. **Product emails**: keep sign-in, invitation, reset and enrolment emails free of any promotion. When reminder and digest emails are built (`MH-07`), give them the product footer in section 8.4 (who sends, contact, link to email preferences). Any email that adds an offer (upgrade, referral, new plan) is a CEM and needs consent and the full footer.

### 1.3 Red lines

- No email to an address from a contact-data tool, a purchased list or a guessed pattern.
- No email without the footer, and no footer without a working unsubscribe.
- No message of any kind after an unsubscribe or a do-not-call request.
- No automated or pre-recorded calls; no faxes.
- No email to an address published next to a "no solicitations" statement.
- No message that says or implies PayClock is a law firm, gives legal advice, or "never misses a deadline" (section 9).

### 1.4 Residual risk

**Email: low**, if the checklist is followed: the address sources, form and unsubscribe match the sections read. What is not certain: whether a generic `info@` address meets "relevant to the person's business role" (CRTC guidance on s. 10(9)(b) was not opened), and whether an association directory's terms forbid this use (a contract question, not CASL). **Calls: low to medium**: the business exemption is confirmed on the DNCL operator's page, but the Telemarketing Rules text itself could not be read today.

### 1.5 When to get professional help anyway

A CRTC notice to produce or any letter from the CRTC; a complaint that reaches the Spam Reporting Centre and is forwarded to us; an association asking us to stop using its directory; a plan to buy a list, use a contact-data tool, or send at volumes over 500 a week; any plan to message individuals at home rather than businesses.

---

## 2. LQ-02 — Law Society Act: is this "providing legal services"?

Original question (kept as written): *Is preparing a per-firm deadline schedule and draft requests, free or paid, the provision of legal services under Law Society Act s. 1(5)-(6)? If so, can it be delivered under the lawyer's supervision or name, and at what cost? Is the self-serve application outside the definition?*

### 2.1 The rule in plain English

| Rule | Section and short quote | Source (opened 2026-11-11) |
|---|---|---|
| A person provides legal services when their conduct involves the "application of legal principles and legal judgment" to someone's circumstances or objectives | Law Society Act s. 1(5) | [Law Society Act, R.S.O. 1990, c. L.8](https://www.ontario.ca/laws/statute/90l08), consolidation from 2024-12-04, e-Laws currency date 2026-11-06; text read through the e-Laws data service |
| That includes when a person "Gives a person advice with respect to the legal interests, rights or responsibilities" | s. 1(6) para. 1 | same |
| It also includes selecting, drafting or completing, on behalf of a person, "a document that affects the legal interests, rights or responsibilities of a person" | s. 1(6) para. 2.vi | same |
| Deemed not to be legal services: a corporation's employee who selects, drafts or completes a document for the corporation; "An individual who is acting on his or her own behalf"; classes in the by-laws | s. 1(8) paras. 2, 3, 5 | same |
| Only a licensee may "practise law in Ontario or provide legal services in Ontario", and a non-licensee may not hold themself out as able to | s. 26.1(1), (2) | same |
| Offence: fine "not more than $25,000 for a first offence", $50,000 after | s. 26.2(1) | same |
| By-Law 4 deems not to be legal services a person whose occupation is not legal services acting in the normal course of it, "excluding representing a person in a proceeding before an adjudicative body" | By-Law 4 s. 28 para. 2 | [LSO By-Law 4](https://lso.ca/about-lso/legislation-and-rules/by-laws/by-law-4), last amended 2025-11-05 (read in the browser) |
| By-Law 4 s. 30 lets some non-licensees give paralegal-level services (in-house employee of one employer, clinics, funded not-for-profits, a friend or neighbour unpaid, family, MPP offices, others). **None covers a software vendor or a paid service to other businesses** | By-Law 4 s. 30 paras. 1-7 | same |
| The Law Society runs a regulatory sandbox, Access to Innovation (A2I), for technology-delivered legal services that "face regulatory barriers": "A2I is a five-year pilot program that began in November 2021." Approved participants need licensee input: "legal knowledge and logic in applications are developed with input from a licensee" | LSO A2I FAQs | [A2I FAQs](https://lso.ca/about-lso/initiatives/access-to-innovation/faqs), no page date shown |
| The LSO says B2B tools sold to licensees are covered by the licensee's own obligations: "A2I does not have any B2B technology providers as approved participants." PayClock sells to businesses that are not licensees, so this does not cover it | same | same |
| Giving only legal information is generally accepted as not legal services in Ontario. **Secondary**: Department of Justice Canada summary; the LSO page on illegal practitioners could not be opened in the browser | Justice Canada, "Appendix: Canadian Regulatory Frameworks", modified 2022-08-15: "the provision of only legal information does not constitute" legal services | [justice.gc.ca appendix](https://justice.gc.ca/eng/rp-pr/jr/ecjh-eamjc/appendix-annexe.html) (secondary, government) |

How the two competitors describe themselves (vendor sources, not law):

| Vendor | Self-description | Source (opened 2026-11-11) |
|---|---|---|
| Tiercord | Terms of service, version 2026-10-09: "Tiercord is software, not a law firm"; output is "not legal advice"; the customer must verify inputs, calculations and current law and "remains solely responsible for deciding whether and when to act"; governed by British Columbia law | https://tiercord.ca/terms |
| PaySub | Home page footer: the product "generates legal documents for reference only" and tells users to consult a licensed construction lawyer before filing lien documents; no terms page linked from the home page | https://paysub.ca/ |

### 2.2 What this means for PayClock (the business's reading, not advice)

| Activity | Reading | Risk |
|---|---|---|
| **Hand-run per-firm schedule** (the Phase 0 free report and paid pilot as now written in [Decision.md 5.1](../Decision.md#51-what-the-pilot-is) and section 9): the founder reads one firm's facts, decides which events they are, computes that firm's dates and drafts request letters for it | Fits s. 1(5) (legal principles applied to one firm's circumstances) and s. 1(6) para. 2.vi (drafting a document that affects rights, on its behalf). No exemption in s. 1(8), By-Law 4 s. 28 or s. 30 fits a paid or free service to another business. "Free" does not help: the definition does not depend on payment. With no lawyer, supervision is not available | **High** |
| **Self-serve software**: the firm's own employee enters the firm's facts; the engine applies a published, section-cited rule the same way for every customer; unknown facts give "not computable" and the missing fact; the employee chooses a fixed template, fills it and sends it | The judgment about facts is made by the firm's own employee (s. 1(8) para. 2 for documents the employee completes for the corporation). PayClock publishes rules and arithmetic (legal information) and does not apply judgment to one firm's case by a person. Not settled: the statute does not mention software, and the LSO's sandbox exists because tech providers to the public may meet regulatory barriers. Both competitors operate openly on this footing | **Medium** |
| Product support ("how do I enter a date", "what does this field mean" with the same published help text for everyone) | Legal information about the tool | Low |
| Telling a customer which date to enter when its facts are ambiguous, whether a notice is valid, or what to do next | Advice on that customer's legal rights (s. 1(6) para. 1) | High: never do it |

### 2.3 Proposed no-lawyer operating model `[P]` (owner decision; the product is not rewritten here)

1. **Self-serve software only.** The customer enters its own facts and runs the engine; the engine computes dates per the statute and shows its uncertainty (certainty of each fact, "not computable" with the missing fact, "no later than" for rights dates with an unknown trigger, the un-extended last day while L-09 is open, the section for every date). This is what B1 already does.
2. **Templates the user sends.** Fixed wording with merge fields only (`AD-07`, `MH-08`); the user decides whether to send, edits nothing PayClock calls a legal statement, and sends it themselves. PayClock never sends anything to a contractor, owner, court or registry (unchanged).
3. **No hand-made per-firm advice.** No human at PayClock interprets a customer's facts, chooses an event, chooses a template for them, or drafts per-firm text. Support answers come from one published help text.
4. **Phase 0 without hand-run schedules.** The free report and the paid pilot by hand (`T-0.2.3`, `T-0.3.1`, `T-0.3.2`) are not offered in their current form. Options for the owner:
   - **B (recommended now)**: the fallback already written in Decision.md section 6: interviews plus a demonstration on synthetic data (Northline Electric Ltd., Baycrest Mechanical Inc., Harbourgate Builders Inc.); gate G1 re-based on signed pilot commitments for the application; stop rule re-computed.
   - **A1 (when it exists)**: a self-serve intake and schedule screen where the firm enters its own facts; the report is what the engine prints, unedited.
   - **A2 (not recommended)**: the firm fills a fixed intake form and the founder types it in verbatim, with no interpretation; ambiguities go back to the firm as "not known"; the firm confirms the entered facts before output. Closer to the line than A1; risk medium to high.
5. **A second person still checks** (section 4): the documents require a Checker, a person other than the one who computes or drafts ([Decision.md section 12 item 6](../Decision.md#12-open-decisions-for-the-founder), `AD-14`, `HR-2`). In the self-serve model the Checker approves each rule version and each template wording; under option A2 the Checker also recomputes every hand-entered schedule (`HR-2`). With a team of one, no rule version is approved and every output keeps flag L-01.
6. **Optional later `[P]`**: apply to A2I. It needs licensee input to the rule logic, which conflicts with the no-lawyer decision, and the five-year pilot that began in November 2021 may have ended or changed; its status after November 2026 was not checked.

### 2.4 Checklist

1. Do not deliver any hand-run per-firm schedule or drafted letter until the owner chooses option A1, A2 or B in writing (Decision.md section 12).
2. Rewrite outreach so it offers the software or a demonstration, not "I am preparing, by hand, a free schedule" (template in section 8.3).
3. Every screen, export and email carries the disclaimer (section 8.1); onboarding acceptance is stored with version and time (exists in schema: `disclaimer_version`, `disclaimer_accepted_at`).
4. Help text and support replies use only published wording; log each support question; any question that asks "what should I do" gets the referral line in section 8.6.
5. Do not use the words lawyer-reviewed, lawyer-signed, legal advice, compliant, guaranteed or "never miss" about PayClock (section 9).

### 2.5 Red lines

- Never tell a customer what its facts mean in law, whether a notice is valid, whether to lien or adjudicate, or which date to enter.
- Never draft or adapt a document for a customer; never choose a template for them.
- Never file, register, serve or send anything for a customer.
- Never say or imply PayClock is a law firm or that anyone at PayClock may give legal advice (s. 26.1(2)).

### 2.6 Residual risk

**High** for the hand-run Phase 0 service as written: it is the case the definition describes and no exemption fits. **Medium** for self-serve software: the reading rests on the customer making its own judgments and PayClock publishing rules; it is the posture both competitors use, but no Ontario decision or LSO statement read today confirms it for software sold to non-lawyer businesses.

### 2.7 When to get professional help anyway

Any letter, call or email from the Law Society of Ontario; a customer or contractor alleging PayClock gave legal advice; a plan to offer any done-for-you service, lawyer referrals for a fee, or adjudication or lien drafting; a decision to apply to A2I; a large customer's contract asking us to warrant legal correctness.

---

## 3. LQ-03 — Liability: disclaimer, limitation of liability, E&O insurance

Original question (kept as written): *What liability cap, disclaimer and insurance should the pilot agreement and terms carry, and what does errors-and-omissions cover cost?*

### 3.1 The rule in plain English

| Point | Source | Status |
|---|---|---|
| A clear exclusion or limitation clause in a business contract is generally enforced in Canada. The Supreme Court asks three things: does the clause cover the event on its words; was it unconscionable when made; is there an overriding public policy reason not to enforce it (Tercon Contractors Ltd. v. British Columbia, 2010 SCC 4) | **Primary blocked**: the SCC judgment page (scc-csc.lexum.com) returned HTTP 403 and the decisions.scc-csc.ca copy did not contain the text. Secondary, labelled: law-firm summaries of Tercon (Osler, McCarthy Tétrault, Mondaq articles) found by search on 2026-11-11 | Secondary |
| A clause cannot remove an offence or regulatory penalty (Law Society Act s. 26.2, CASL s. 20). It is no defence to a claim that our own marketing promised more than the product does | Law Society Act s. 26.2; CASL s. 20(4) (both opened, section 1 and 2) | Primary |
| Typical SaaS terms: "as is" service, no warranties, no indirect or consequential damages, total liability capped at fees paid in the previous 12 months (often with a small floor), customer verifies output and decides, customer indemnity, governing law and courts named | Tiercord terms version 2026-10-09 (https://tiercord.ca/terms): as-is, disclaimer of warranties, exclusion of "indirect, incidental, special, exemplary, punitive or consequential loss", cap on aggregate liability (the greater of 12 months' fees and CAD 100, per [Decision.md section 3](../Decision.md#3-competitor-gap-the-decisive-question)), customer indemnity, no insurance mention | Vendor source |
| Buyers are corporations, so consumer-protection statutes for individuals are assumed not to apply | Ontario Consumer Protection Act, 2002 **not opened**; author's reading | Not verified |
| Technology E&O insurance is not required by law. Small Canadian technology firms are quoted roughly CAD 500 to 3,000 a year for basic professional liability | **Secondary**, broker marketing pages found by search on 2026-11-11 (sharpinsurance.ca, zensurance.com, acera.ca); no quote obtained | Secondary, `[A]` for planning |

### 3.2 What the business must do

1. Before the first paid customer, publish terms of use with the clauses in section 8.2 and the disclaimer in section 8.1; require click acceptance at onboarding (S-02) and store version and time (exists).
2. Use Ontario law and Toronto courts `[P]`.
3. Cap liability at the fees paid in the 12 months before the claim, with a CAD 100 floor `[P]` (the market's form).
4. Make the clauses conspicuous: their own heading, plain words, shown in full at acceptance (helps on Tercon's first and second questions).
5. Keep the product's behaviour and the marketing consistent with the clauses (section 9): a cap does not protect a promise we should not have made.
6. Ask one insurance broker for a quote for technology E&O plus cyber, CAD 1M limit `[P]`, before the first paid pilot; ask specifically whether "legal advice" or "professional services of a lawyer" is excluded and get the answer in writing. Record the premium in Decision.md section 8.1 (missing input today).
7. Keep the audit trail that already exists (recomputation records, sent-template records): it is the evidence that the customer entered the facts and chose to act.

### 3.3 Red lines

- No guarantee of any date, outcome, collection or "compliance".
- No clause that claims to exclude liability for fraud or deliberate wrongdoing (unlikely to be enforced; do not write it).
- No paid pilot before terms and disclaimer are accepted in writing or by click.

### 3.4 Residual risk

**Medium.** The clause form is standard and the buyer is a business, but the main harm (a right lost because a date was shown late) can exceed any cap in a customer's eyes, a court may read a clause against its author, and there is no insurance quote yet.

### 3.5 When to get professional help anyway

A customer claims a loss or threatens suit; a customer asks to negotiate the cap or demands an indemnity; an insurer refuses cover or excludes the core risk; revenue passes CAD 250,000 a year `[P]`; any enterprise or government buyer sends its own contract.

---

## 4. L-01 to L-03 — rule versions, disclaimer, terms and templates without a lawyer

Original points (kept as written in Decision.md section 6): *L-01 Every rule version before it is used with a customer; signed memo (`T-0.1.3`, `T-1.1.4`). L-02 Disclaimer, terms and pilot agreement. L-03 Wording of each template.*

Replacement `[P]`, owner decision 2026-11-11 (no lawyer):

1. **Rule version approval (L-01)** becomes a **two-person self-check**: the Rules lead drafts the version from the e-Laws consolidation and records every section; the **Checker** (a different person, Decision.md section 12 item 6) re-derives every clock from the statute text without seeing the draft's dates, runs the golden cases, and signs. The signed self-check record is hashed and stored as the sign-off (the existing `legal_signoff` row: reviewer is the Checker, licence jurisdiction recorded as `none: two-person self-check`). No code change is needed: approval already requires a sign-off row, and until one exists every result carries L-01. Customer-facing text then says "rule table checked by two people against the Construction Act; not reviewed by a lawyer".
2. **Disclaimer, terms (L-02)**: the templates in sections 8.1 and 8.2, approved by the owner; the pilot agreement only if the owner chooses option A2 (section 2.3).
3. **Template wording (L-03)**: the six templates stay fixed text with merge fields (`AD-07`). Each wording is approved by the Rules lead and the Checker against the wording rules in section 9: it states facts and dates with their section, never a legal conclusion ("we are entitled to", "you are in breach"), and carries the short disclaimer.
4. **Statute changes**: on any amendment, the same two-person check makes a new version; an approved version is never edited (unchanged).

Red line: never mark a rule version approved with one person, and never call it lawyer-reviewed. Residual risk: **medium**, because a statutory misreading that both people share is not caught; golden cases and the conservative display (un-extended day, "no later than", withheld output) limit the harm. Get help anyway when: a customer or contractor disputes a computed date with a reasoned argument; an amendment changes a day count or a trigger; two readings of a section remain after the check (L-07 type).

## 5. L-04 to L-11 — points that stay with the customer's own lawyer

These were to be answered in `T-0.1.3` (L-05 to L-09, L-11) or are by nature for the customer's lawyer (L-04, L-10). With no lawyer of our own, they are **not answered**, and the product already handles that safely: the dependent output is withheld or shown as "not computed" with the flag and the note "ask your lawyer" (engine notes in `packages/rules/src/engine.ts`; [CLAUDE.md](../CLAUDE.md) prohibited shortcuts). Nothing changes in code. The rights date shown while L-09 is open is the un-extended (earlier) day. Interest amounts stay withheld (L-09). Residual risk: **low** for wrong output, because output is withheld; the cost is less output for the customer.

## 6. Privacy (PIPEDA)

| Rule | Section and short quote | Source (opened 2026-11-11) |
|---|---|---|
| Part 1 does not apply to business contact information used "solely for the purpose of communicating" with a person about their work | PIPEDA s. 2(1) "business contact information", s. 4.01 | [PIPEDA](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-1.html), current to 2026-10-19 |
| We stay responsible for information "transferred to a third party for processing" and must use contracts for comparable protection | Schedule 1, clause 4.1.3 | [PIPEDA Schedule 1](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html) |
| Safeguards match the sensitivity of the information | Schedule 1, clause 4.7 | same |

Checklist: (1) use the prospect list only to contact people about their work; do not enrich it with personal data; (2) customer data: keep the existing rules (records in Canada, no amounts or names in emails, processors named in the privacy notice, TRD 8.10); (3) sign the processors' data processing terms (Postmark, Stripe) before use; (4) breach: follow the plan in TRD and record every breach (the PIPEDA breach sections were not re-read today). Red line: no customer data in prospect lists, logs, fixtures or examples. Residual risk: **low to medium** (open decision F-010 on processors' retention). Get help anyway when: a breach affects customer data; a customer sends a data processing agreement; a processor outside Canada is added.

## 7. Foreign rules

PayClock is Ontario-only, sold to Ontario businesses, and no outreach goes outside Canada. No foreign rule was identified as applying. Two processors are outside Canada (TRD 8.10); that is a PIPEDA accountability point (section 6), not a foreign licensing one. If outreach or sales ever go outside Ontario, a new check is needed (other provinces' law societies; US state anti-spam and telemarketing rules).

---

## 8. Templates (template - adapt)

Bracketed items are filled in. Keep the wording plain; do not add legal conclusions.

### 8.1 Disclaimer (template - adapt)

**Short (every screen footer, export page, template and email):**

> PayClock is software, not a law firm, and does not give legal advice. Dates are calculated from the facts you enter, using the Construction Act as published on e-Laws. Check every date and talk to your lawyer before a lien, adjudication or other legal step.

**Full (onboarding S-02, terms, help page):**

> PayClock is a software tool. It is not a law firm, no one at PayClock is a lawyer or paralegal, and nothing in PayClock is legal advice.
>
> PayClock applies the published rules of Ontario's Construction Act to the facts that you enter. It shows the section behind each date, which facts are confirmed, estimated or unknown, and which dates it cannot calculate. A date can be wrong if a fact you entered is wrong or missing, if the law changes, or if a court or adjudicator reads the law differently. Where a starting fact is unknown, a last day is shown as "no later than" and may be earlier.
>
> The rule table was checked by two people against the statute. It has not been reviewed by a lawyer.
>
> You decide whether and when to act and what to send. PayClock never sends anything to your contractor, owner, a court or a registry. Before you rely on a date for a lien, adjudication, notice or claim, confirm it with your lawyer.

### 8.2 Terms of use: liability clauses (template - adapt)

> **[n]. No legal advice.** The Service is software. [Business name] is not a law firm and does not provide legal services. The Service applies published statutory rules to information you enter. You are responsible for the accuracy and completeness of that information, for checking every result, and for every decision to act or not to act.
>
> **[n+1]. No warranty.** The Service is provided "as is" and "as available". To the extent the law allows, [Business name] makes no warranty or condition, express or implied, including that the Service or any date, calculation or template is accurate, complete, current or fit for a purpose.
>
> **[n+2]. Limitation of liability.** To the extent the law allows: (a) [Business name] is not liable for any indirect, incidental, special, consequential or punitive loss, or for loss of profit, revenue, payment, lien, adjudication or other rights or claims, even if advised that it was possible; and (b) [Business name]'s total liability for all claims arising out of or relating to the Service is limited to the greater of the fees you paid for the Service in the 12 months before the event giving rise to the claim and CAD 100. This section applies whatever the legal theory of the claim, including contract, negligence and misrepresentation, and does not limit liability that cannot be limited by law.
>
> **[n+3]. Your responsibility.** You will confirm every date with your own lawyer before taking or deciding not to take a legal step. You will not present output from the Service to anyone as legal advice from [Business name].
>
> **[n+4]. Governing law.** These terms are governed by the laws of Ontario and the federal laws of Canada that apply there. The courts of Ontario sitting in Toronto have jurisdiction.

### 8.3 Outreach email footer and revised offer (template - adapt)

Footer, on every outreach email:

> [Sender name], [business name], [mailing address], [phone], [email]. You are receiving this because [Company]'s address is published at [page] as of [date seen]. To stop all emails from us, reply "unsubscribe" or use [link]; we act on it the same day.
>
> PayClock is software, not a law firm, and does not give legal advice.

Revised offer paragraph for the first email under option B (replaces "I am preparing, by hand, a free schedule ..." in Decision.md section 9 only if the owner chooses B):

> I am building PayClock, software that shows, for each open invoice, which Construction Act dates your own records allow you to work out, which fact is missing when they do not, and a standard wording you can use to ask your GC for it. I would like 20 minutes to show it on a made-up project and hear how you track these dates today. You enter your own facts and decide what to send; it is software, not legal advice.

### 8.4 Product email footer (reminders and digests, when built) (template - adapt)

> Sent by PayClock, [business name], [mailing address], [support email], because you are a user of the [firm] workspace. Change which emails you get: [preferences link]. PayClock is software, not a law firm; check dates with your lawyer before a legal step.

### 8.5 Phone opener and consent wording (template - adapt)

> Hello, this is [name] from PayClock, [business name], calling about software for subcontractor payment and lien dates. Could I speak with whoever handles receivables? ... If I may, I'll email you a short note. Is [address] right? You can tell me to stop at any time, by reply or by phone at [phone].

If the person says no or asks not to be called: "Understood, I will not call or email again." Add them to both lists the same day.

### 8.6 Referral line for support questions that ask for advice (template - adapt)

> I can't tell you what to do in your situation: that is legal advice, and PayClock does not give it. PayClock shows the dates its rules calculate from the facts you entered and the section each comes from. For what to do next, please ask your lawyer.

## 9. Wording rules (all pages, emails, templates, sales calls)

1. Say "software" and "dates calculated from the facts you enter". Never "legal advice", "law firm", "lawyer-reviewed", "lawyer-signed", "compliant", "guaranteed", "certified" or "never miss a deadline".
2. Say what PayClock does: a date where the facts allow it; otherwise the missing fact and a standard request. Never "the 35-day date on every invoice" (C1 rule, kept).
3. Rights dates with an unknown trigger are "no later than" and may be earlier; say so.
4. State facts and sections, not conclusions: "Payment was due on [date] under s. 6.5(2) if [fact]", not "the GC is in breach" or "you are entitled to interest".
5. "You decide" and "you send": every action is the user's.
6. Templates contain merge fields only; no free text generated by PayClock; each carries the short disclaimer.
7. Never "the only" Canadian tracker; never say PaySub or Tiercord lack notices (C1 rule, kept).
8. Every outreach email has the section 8.3 footer; every product email after `MH-07` has the section 8.4 footer.
9. In support, answer how the tool works; for "what should I do", use the section 8.6 line.

## 10. When to get professional help anyway (all topics)

Get a lawyer (or the right professional) as soon as any of these happens; the owner's no-lawyer decision does not cover them:

1. A letter, call or email from the Law Society of Ontario, the CRTC, the Competition Bureau or the Privacy Commissioner.
2. A customer, contractor or owner claims a loss, threatens suit, or says PayClock gave legal advice.
3. A customer or prospect's contract demands warranties, an indemnity, a higher cap, or proof of insurance or legal review.
4. A privacy breach affecting customer data.
5. Any plan for a done-for-you service, per-firm schedules by hand (option A2), lien or adjudication drafting, or paid referrals to lawyers.
6. A Construction Act amendment that changes a trigger or day count, or a section with two readings that matters to an output now withheld (L-07, L-09).
7. Expansion outside Ontario, a purchased list, or a new outreach channel (SMS, automated calls).
8. An insurer declines cover or excludes the core risk.

## 11. Owner sign-off record

| Date | Decision | Recorded by | Status |
|---|---|---|---|
| 2026-11-11 | No lawyer is hired for now. Legal questions LQ-01 to LQ-03 and points L-01 to L-03 are answered by this self-check from primary sources; the owner accepts the residual risk stated in each section. This is not legal advice | Lead, from the owner's instruction in `_coordination/C2-GUIDE.md` | Recorded |
| pending | Choose the Phase 0 model under section 2.3: option B (recommended), A1 or A2 | Owner | `[P]` open, Decision.md section 12 item 9 |
| pending | Adopt the templates in section 8, the cap in 3.2 item 3, Ontario law, and the insurance quote step | Owner | `[P]` open, Decision.md section 12 item 10 |
| pending | Name the Checker (unchanged requirement; with a team of one no rule version is approved and no hand-entered schedule can be sent) | Owner | Open, Decision.md section 12 item 6 |

## 12. Sources opened on 2026-11-11

| Source | Used for | Access |
|---|---|---|
| CASL, S.C. 2010, c. 23, https://laws-lois.justice.gc.ca/eng/acts/E-1.6/ (pages 1-3) | ss. 1(2), 6, 10(9), 11, 13, 20(4) | Open, current to 2026-10-19 |
| Electronic Commerce Protection Regulations (CRTC), SOR/2012-36, https://laws-lois.justice.gc.ca/eng/regulations/SOR-2012-36/FullText.html | ss. 2-4 | Open |
| National DNCL operator, Exemptions, https://lnnte-dncl.gc.ca/en/Organization/Exemptions | Business-call exemption; internal list | Open (page dated 2018-04-09) |
| CRTC Unsolicited Telecommunications Rules, https://crtc.gc.ca/eng/trules-reglest.htm | Telemarketing Rules | **Blocked** by a browser security check; secondary search summaries used, labelled |
| Law Society Act, R.S.O. 1990, c. L.8, https://www.ontario.ca/laws/statute/90l08 | ss. 1(5)-(8), 26.1, 26.2 | Open through the e-Laws data service; currency date 2026-11-06 |
| LSO By-Law 4, https://lso.ca/about-lso/legislation-and-rules/by-laws/by-law-4 | ss. 28, 30 | Open in the browser; last amended 2025-11-05 |
| LSO Access to Innovation FAQs, https://lso.ca/about-lso/initiatives/access-to-innovation/faqs | Sandbox scope, B2B position, licensee input | Open in the browser |
| Justice Canada, "Appendix: Canadian Regulatory Frameworks", https://justice.gc.ca/eng/rp-pr/jr/ecjh-eamjc/appendix-annexe.html | Legal information is generally not legal services | Open; secondary (government summary), modified 2022-08-15 |
| Tiercord terms, https://tiercord.ca/terms | Vendor self-description and liability clauses | Open, version 2026-10-09 |
| PaySub home page, https://paysub.ca/ | Vendor self-description | Open |
| Tercon Contractors v. British Columbia, 2010 SCC 4 | Exclusion-clause test | **Primary not readable** (HTTP 403); law-firm summaries by search, labelled secondary |
| Insurance broker pages (sharpinsurance.ca, zensurance.com, acera.ca) by search | E&O cost range | Secondary; no quote obtained |
| PIPEDA, S.C. 2000, c. 5, https://laws-lois.justice.gc.ca/eng/acts/P-8.6/ (pages 1, 7) | s. 2(1), s. 4.01, Schedule 1 clauses 4.1.3, 4.7 | Open, current to 2026-10-19 |
| LSO page "Taking action against illegal practitioners" | Legal information vs advice | **Not opened** (browser navigation refused) |
