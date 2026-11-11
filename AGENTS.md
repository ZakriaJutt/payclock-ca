# AGENTS.md — PayClock (`payclock-ca`)

Canonical instructions for any agent or person working in this repository. Since 2026-11-11 it holds the ten planning documents plus code: build milestone B1 (owner-authorised before the Phase 0 gate: foundation and deterministic date engine, branch `feat/b1-foundation`) and B2 (branch `feat/b2-local-auth`: local password-plus-TOTP sign-in with database sessions, invitation and reset links by email through SMTP to the local Mailpit inbox, evidence files through the S3 API to local MinIO). No UI, no real provider account, no lawyer-signed rule version; Supabase Auth is a deferred option. Status of every check: [verification-report-fixing.md sections 9 and 10](verification-report-fixing.md#10-build-milestone-b2-2026-11-11). **Commands are proposed unless listed under "Commands that exist" below.**

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

- Layout: `apps/web`, `apps/worker`, `packages/rules`, `packages/domain`, `packages/db`, `packages/platform` exist (npm workspaces; pnpm is not installed); `packages/templates` is still proposed.
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

Before adding a helper, search `packages/platform` and `packages/rules`. Configuration, logging, correlation, queue access, storage keys and mail live once in `packages/platform`; apps must not copy them. Import packages by entry point only (lint enforces it).

### Utilities index (B1)

All code lives under `workspace/` (npm workspace root); the repository root keeps only the ten documents, `.gitignore` and `Makefile`. Paths below are relative to `workspace/`.

| Need | Use | Where |
|---|---|---|
| Civil date, add days, compare, weekday | `civil`, `addDays`, `daysBetween`, `dayOfWeek`, `minDate`, `isCivilDate` | `packages/rules/src/civil-date.ts` |
| Holiday test and extension; holiday rows for seeding | `isHoliday`, `extendPastHolidays`, `ontarioHolidayRows` | `packages/rules/src/holidays.ts` |
| All clock dates for one subcontract | `compute(input)` | `packages/rules/src/engine.ts` |
| Transition regime | `selectRegime` | `packages/rules/src/regime.ts` |
| Rule versions as data; holiday changes | `RULE_VERSIONS` (loaded as `draft` revisions by `syncDraftRules`, which recomputes on any change); `changeProclaimedHoliday` | `packages/rules/src/versions.ts`, `packages/domain/src/rules-sync.ts` |
| Overdue; interest arithmetic and the withheld statement | `overdueStatus`, `simpleInterestCents`, `interestStatement` | `packages/rules/src/overdue.ts`, `interest.ts` |
| Hash, canonical JSON (pure) | `sha256Hex`, `canonicalJson` | `packages/rules/src/sha256.ts` |
| Golden cases | `runGolden` | `packages/rules/golden/run.ts` |
| Config | `loadConfig` | `packages/platform/src/config.ts` |
| Logger with redaction; correlation; Toronto today | `createLogger`, `withCorrelation`, `normaliseCorrelationId`, `torontoToday` | `packages/platform/src/logger.ts`, `correlation.ts` |
| Queue; job envelope that refuses a missing tenant | `createPgBossQueue`, `assertEnvelope`, `installQueueSchema` | `packages/platform/src/queue.ts` |
| Database access (the only way) | `TenantDb.withTenant`, `withoutTenant`, `withGlobalWrite` (migrator only) | `packages/db/src/client.ts` |
| Migrations, order check, ORM parity, test reset | `migrate`, `checkOrder`, `ormParity`, `resetTestSchemas` | `packages/db/src/` |
| Use cases | `createProject`, `createSubcontract`, `createInvoice`, `addEvent`, `correctEvent`, `getInvoice`, `getRecomputation`, `recomputeBatch`, `invariantCheck` | `packages/domain/src/` |
| Audit row | `audit` | `packages/domain/src/audit.ts` |
| Durable recompute after a rule or holiday change; stale scan; worker loop (queue under RLS; claims via `claim_recompute_pending`; `DrainHooks` test seams) | `enqueueAllProjects`, `enqueueStale`, `drainPending`, `startDrainLoop` | `packages/domain/src/pending.ts`, `apps/worker/src/drain.ts` |
| Stale-on-read check | `staleRunIds` (used by `getInvoice`, `getRecomputation`) | `packages/domain/src/queries.ts` |
| Sign-in, sessions, CSRF token, invitations (incl. first owner), password reset, TOTP enrolment, team removal (B2) | `LocalAuthService` (`signIn`, `authenticate`, `checkCsrf`, `signOut`, `revokeAllForUser`, `inviteFirstOwner`, `invite`, `acceptInvitation`, `requestPasswordReset`, `completePasswordReset`, `beginTotp`, `confirmTotp`, `listMemberships`, `removeMembership`) | `packages/domain/src/auth/service.ts` |
| Password hash (scrypt), tokens, TOTP (RFC 6238), AES-GCM, HMAC; password rules | `hashPassword`, `verifyPassword`, `randomToken`, `sha256`, `totpCode`, `verifyTotp`, `encrypt`, `decrypt`, `hmacHex`; `checkPassword` | `packages/domain/src/auth/crypto.ts`, `password-policy.ts` |
| Evidence files: upload with type and size checks, 5-minute link, download; scanners | `uploadDocument`, `documentLink`, `downloadDocument`, `localSignatureScanner`, `noScanner` | `packages/domain/src/documents.ts` |
| Mail (SMTP; Mailpit locally) | `createSmtpMailer`, `MemoryMailer` | `packages/platform/src/mailer.ts` |
| Object storage (S3 API; MinIO locally); tenant-keyed object names | `createS3BlobStore`, `MemoryBlobStore`, `storageKey`, `keyBelongsTo` | `packages/platform/src/storage.ts` |
| Session cookie attributes and parsing; `AuthProvider` interface | `sessionCookie`, `clearedCookie`, `readCookie` | `apps/web/src/auth.ts` (fake provider only in `apps/web/test/fake-auth.ts`) |
| Identity transaction (no tenant) | `TenantDb.withIdentity` | `packages/db/src/client.ts` |

### Commands that exist (B1)

`make` targets run from the repository root; `npm` commands from `workspace/`.

| Command | Does |
|---|---|
| `make setup` | `npm install`, create role `payclock_app` (NOSUPERUSER NOBYPASSRLS) and git-ignored `.env.local` / `.env.test` (auth key, Mailpit and MinIO settings; names only in `workspace/.env.example`), migrate `payclock_dev` |
| `make dev` / `make dev-check` | Migrate, seed (first-owner invitations go to Mailpit at http://127.0.0.1:8025), start API on 8104 and the worker, print "ready" from `/readyz` (database, queue, storage); `dev-check` then stops |
| `make lint`, `make typecheck` | ESLint with import boundaries; `tsc --noEmit` |
| `make test-unit`, `make test-integration` | Vitest; integration drops and re-migrates `payclock_test` first and needs Mailpit (SMTP 1025, API 8025) and MinIO (9000, bucket `payclock-dev`) running |
| `make golden`, `make parity` | `scripts/golden-verify.ts`; `scripts/orm-parity.ts --test` |
| `npm run db:migrate`, `npm run db:migrate-test`, `npm run seed` | Migrations plus queue schema; synthetic seed (refuses outside local/test) |
| `npm run rules:sync [-- --test]` | New draft revision for any changed rule version, holiday table per s. 88 for 2018-2040, recompute of every stored deadline |

Sign-in API (B2): `POST /api/v1/auth/sign-in`, `/auth/sign-out`, `/auth/sessions/revoke-all`, `/auth/password-reset/request`, `/auth/password-reset/complete`, `/auth/invitations/accept`, `/auth/totp/enroll`, `/auth/totp/confirm`, `GET /auth/session`; `POST /invitations`, `GET /memberships`, `DELETE /memberships/{id}`; `POST /documents`, `GET /documents/{id}/link`, `GET /documents/{id}/content`.

Still proposed: Docker Compose, CI, staging, `scripts/backfill-runner`, `scripts/link-check`, `scripts/restore-drill`.

## 6. Tenant safety

Every tenant table has `tenant_id` and row-level security. Open database connections only through the tenant-scoped client. Jobs carry the tenant and refuse to run without it. Storage keys and any cache key include the tenant. Cross-tenant requests return 404. New endpoints need a cross-tenant test (`IT-01` pattern). Identity tables (`app_user`, `user_credential`, `auth_session`, `auth_token`, `auth_throttle`) are global, hold no tenant business data and store tokens only as SHA-256; a session is honoured only with a live membership of its tenant, checked on every request.

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
