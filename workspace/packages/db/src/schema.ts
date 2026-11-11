/**
 * ORM model (Drizzle). Must match the migrated database exactly: `scripts/orm-parity.ts` and the
 * IT-10 parity test compare tables, columns, nullability, indexes and constraint names.
 */
import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, customType, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgPolicy, pgTable,
  primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
const cents = (name: string) => bigint(name, { mode: 'number' });
const civilDate = (name: string) => date(name, { mode: 'string' });
const tenantPolicy = (table: string) =>
  pgPolicy(`${table}_isolation`, { as: 'permissive', for: 'all', using: sql`tenant_id = app_current_tenant()`, withCheck: sql`tenant_id = app_current_tenant()` });

export const planKind = pgEnum('plan_kind', ['pilot', 'launch', 'starter', 'pro', 'business']);
export const subscriptionStatus = pgEnum('subscription_status', ['none', 'active', 'past_due', 'read_only', 'cancelled']);
export const tenantStatus = pgEnum('tenant_status', ['active', 'locked', 'deleting']);
export const memberRole = pgEnum('member_role', ['owner', 'member', 'viewer']);
export const memberStatus = pgEnum('member_status', ['invited', 'active', 'removed']);
export const triState = pgEnum('tri_state', ['yes', 'no', 'unknown']);
export const invoiceStatus = pgEnum('invoice_status', ['open', 'paid', 'written_off']);
export const scopeType = pgEnum('scope_type', ['project', 'subcontract', 'invoice']);
export const eventType = pgEnum('event_type', [
  'EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10',
  'EV-11', 'EV-12', 'EV-13', 'EV-14', 'EV-15', 'EV-16', 'EV-17', 'EV-18', 'EV-19',
]);
export const certainty = pgEnum('certainty', ['confirmed', 'estimated', 'unknown']);
export const noticeForm = pgEnum('notice_form', ['1.2', '1.3']);
export const ruleStatus = pgEnum('rule_status', ['draft', 'approved', 'retired']);
export const runCause = pgEnum('run_cause', ['new_event', 'correction', 'rule_version', 'holiday_table', 'import']);
export const runStatus = pgEnum('run_status', ['succeeded', 'discarded', 'failed']);
export const deadlineState = pgEnum('deadline_state', ['computed', 'provisional', 'not_computable', 'not_applicable']);
export const deadlineBound = pgEnum('deadline_bound', ['exact', 'no_later_than']);
export const reminderKind = pgEnum('reminder_kind', ['actby_d14', 'actby_d7', 'actby_d3', 'actby_d0', 'last_d5', 'last_d2', 'last_d0', 'due', 'due_plus3', 'urgent_moved_earlier']);
export const reminderStatus = pgEnum('reminder_status', ['scheduled', 'sent', 'cancelled', 'failed']);

export const tenant = pgTable('tenant', {
  id: uuid('id').primaryKey().defaultRandom(),
  legalName: text('legal_name').notNull(),
  trade: text('trade'),
  digestWeekday: smallint('digest_weekday').notNull().default(1),
  disclaimerVersion: text('disclaimer_version'),
  disclaimerAcceptedAt: ts('disclaimer_accepted_at'),
  plan: planKind('plan').notNull().default('pilot'),
  subscriptionStatus: subscriptionStatus('subscription_status').notNull().default('none'),
  status: tenantStatus('status').notNull().default('active'),
  deletedAt: ts('deleted_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, () => [
  check('tenant_digest_weekday_check', sql`digest_weekday between 0 and 6`),
  pgPolicy('tenant_isolation', { as: 'permissive', for: 'all', using: sql`id = app_current_tenant()`, withCheck: sql`id = app_current_tenant()` }),
]).enableRLS();

export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey(),
  email: citext('email').notNull(),
  displayName: text('display_name').notNull(),
  isOperator: boolean('is_operator').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [unique('app_user_email_key').on(t.email)]);

export const membership = pgTable('membership', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  role: memberRole('role').notNull(),
  status: memberStatus('status').notNull().default('invited'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'membership_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),
  foreignKey({ name: 'membership_user_id_fkey', columns: [t.userId], foreignColumns: [appUser.id] }),
  unique('membership_tenant_user_key').on(t.tenantId, t.userId),
  index('membership_user_idx').on(t.userId),
  tenantPolicy('membership'),
]).enableRLS();

export const project = pgTable('project', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  contractorName: text('contractor_name').notNull(),
  ownerName: text('owner_name'),
  premisesLeased: triState('premises_leased').notNull().default('unknown'),
  leaseFirstEnteredOn: civilDate('lease_first_entered_on'),
  municipalInterest: triState('municipal_interest').notNull().default('unknown'),
  factVersion: integer('fact_version').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'project_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),unique('project_tenant_id_key').on(t.tenantId, t.id), tenantPolicy('project')]).enableRLS();

export const subcontract = pgTable('subcontract', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull(),
  reference: text('reference'),
  hasSubSubs: boolean('has_sub_subs'),
  holdbackRate: numeric('holdback_rate', { precision: 5, scale: 4 }).notNull().default('0.1000'),
  factVersion: integer('fact_version').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  unique('subcontract_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'subcontract_project_fk', columns: [t.tenantId, t.projectId], foreignColumns: [project.tenantId, project.id] }),
  index('subcontract_project_idx').on(t.tenantId, t.projectId),
  tenantPolicy('subcontract'),
]).enableRLS();

export const invoice = pgTable('invoice', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  subcontractId: uuid('subcontract_id').notNull(),
  number: text('number').notNull(),
  givenToContractorOn: civilDate('given_to_contractor_on'),
  amountCents: cents('amount_cents').notNull(),
  holdbackCents: cents('holdback_cents').notNull().default(0),
  status: invoiceStatus('status').notNull().default('open'),
  factVersion: integer('fact_version').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  unique('invoice_tenant_id_key').on(t.tenantId, t.id),
  unique('invoice_number_key').on(t.tenantId, t.subcontractId, t.number),
  foreignKey({ name: 'invoice_subcontract_fk', columns: [t.tenantId, t.subcontractId], foreignColumns: [subcontract.tenantId, subcontract.id] }),
  check('invoice_amount_check', sql`amount_cents >= 0`),
  check('invoice_holdback_check', sql`holdback_cents >= 0 and holdback_cents <= amount_cents`),
  index('invoice_status_idx').on(t.tenantId, t.status),
  index('invoice_subcontract_idx').on(t.tenantId, t.subcontractId),
  tenantPolicy('invoice'),
]).enableRLS();

export const event = pgTable('event', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  scopeType: scopeType('scope_type').notNull(),
  scopeId: uuid('scope_id').notNull(),
  eventType: eventType('event_type').notNull(),
  seriesKey: text('series_key').notNull().default('main'),
  occurredOn: civilDate('occurred_on'),
  receivedOn: civilDate('received_on'),
  deliveryMethod: text('delivery_method'),
  enteredByOperator: boolean('entered_by_operator').notNull().default(false),
  certainty: certainty('certainty').notNull(),
  amountCents: cents('amount_cents'),
  noticeForm: noticeForm('notice_form'),
  documentId: uuid('document_id'),
  version: integer('version').notNull().default(1),
  supersedesId: uuid('supersedes_id'),
  supersededAt: ts('superseded_at'),
  reason: text('reason'),
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'event_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),
  foreignKey({ name: 'event_created_by_fkey', columns: [t.createdBy], foreignColumns: [appUser.id] }),
  unique('event_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'event_supersedes_fk', columns: [t.tenantId, t.supersedesId], foreignColumns: [t.tenantId, t.id] }),
  check('event_amount_check', sql`amount_cents is null or amount_cents >= 0`),
  check('event_unknown_check', sql`(certainty = 'unknown') = (occurred_on is null)`),
  check('event_operator_check', sql`not entered_by_operator or certainty <> 'confirmed'`),
  check('event_reason_check', sql`supersedes_id is null or (reason is not null and length(btrim(reason)) > 0)`),
  check('event_notice_form_check', sql`(event_type = 'EV-05') = (notice_form is not null)`),
  check('event_received_check', sql`received_on is null or event_type = 'EV-05'`),
  check('event_scope_check', sql`(scope_type = 'invoice' and event_type in ('EV-01','EV-02','EV-03','EV-04','EV-05','EV-06'))
    or (scope_type = 'subcontract' and event_type in ('EV-07','EV-10','EV-14','EV-15','EV-16'))
    or (scope_type = 'project' and event_type in ('EV-08','EV-09','EV-11','EV-12','EV-13','EV-17','EV-18','EV-19'))`),
  uniqueIndex('event_current_idx').on(t.tenantId, t.scopeType, t.scopeId, t.eventType, t.seriesKey).where(sql`superseded_at is null`),
  index('event_history_idx').on(t.tenantId, t.scopeType, t.scopeId, t.createdAt),
  tenantPolicy('event'),
]).enableRLS();

export const legalSignoff = pgTable('legal_signoff', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewerName: text('reviewer_name').notNull(),
  licenceJurisdiction: text('licence_jurisdiction').notNull(),
  memoSha256: bytea('memo_sha256').notNull(),
  signedOn: civilDate('signed_on').notNull(),
  scopeNote: text('scope_note'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const ruleVersion = pgTable('rule_version', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  revision: integer('revision').notNull().default(1),
  contentSha256: text('content_sha256'),
  family: text('family').notNull(),
  jurisdiction: text('jurisdiction').notNull().default('ON'),
  effectiveFrom: civilDate('effective_from').notNull(),
  effectiveTo: civilDate('effective_to'),
  status: ruleStatus('status').notNull().default('draft'),
  legalSource: text('legal_source').notNull(),
  signoffId: uuid('signoff_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'rule_version_signoff_id_fkey', columns: [t.signoffId], foreignColumns: [legalSignoff.id] }),
  unique('rule_version_code_revision_key').on(t.code, t.revision),
  uniqueIndex('rule_version_one_live_idx').on(t.code).where(sql`status <> 'retired'`),
  check('rule_version_signoff_check', sql`status <> 'approved' or signoff_id is not null`),
  index('rule_version_selection_idx').on(t.jurisdiction, t.effectiveFrom).where(sql`status = 'approved'`),
]);

export const ruleClock = pgTable('rule_clock', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleVersionId: uuid('rule_version_id').notNull(),
  clockCode: text('clock_code').notNull(),
  variant: text('variant').notNull().default(''),
  triggerSpec: jsonb('trigger_spec').notNull(),
  pendingQuestion: text('pending_question'),
  offsetDays: integer('offset_days').notNull(),
  windowEndDays: integer('window_end_days'),
  extendOnHoliday: boolean('extend_on_holiday').notNull(),
  actByBufferDays: integer('act_by_buffer_days').notNull().default(0),
  sectionRef: text('section_ref').notNull(),
  appliesWhen: jsonb('applies_when'),
  computed: boolean('computed').notNull().default(true),
  notComputedReason: text('not_computed_reason'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'rule_clock_rule_version_id_fkey', columns: [t.ruleVersionId], foreignColumns: [ruleVersion.id] }),unique('rule_clock_key').on(t.ruleVersionId, t.clockCode, t.variant)]);

export const holiday = pgTable('holiday', {
  jurisdiction: text('jurisdiction').notNull(),
  day: civilDate('day').notNull(),
  name: text('name').notNull(),
  source: text('source').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ name: 'holiday_pkey', columns: [t.jurisdiction, t.day] })]);

export const holidayCoverage = pgTable('holiday_coverage', {
  jurisdiction: text('jurisdiction').notNull(),
  year: integer('year').notNull(),
  source: text('source').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ name: 'holiday_coverage_pkey', columns: [t.jurisdiction, t.year] })]);

export const interestRate = pgTable('interest_rate', {
  id: uuid('id').primaryKey().defaultRandom(),
  jurisdiction: text('jurisdiction').notNull(),
  effectiveFrom: civilDate('effective_from').notNull(),
  effectiveTo: civilDate('effective_to'),
  annualRate: numeric('annual_rate', { precision: 6, scale: 4 }).notNull(),
  source: text('source').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const computationRun = pgTable('computation_run', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  scopeType: scopeType('scope_type').notNull(),
  scopeId: uuid('scope_id').notNull(),
  cause: runCause('cause').notNull(),
  causeEventId: uuid('cause_event_id'),
  factVersionRead: integer('fact_version_read').notNull(),
  inputsHash: bytea('inputs_hash').notNull(),
  engineVersion: text('engine_version').notNull(),
  status: runStatus('status').notNull(),
  createdBy: uuid('created_by'),
  rulesGen: integer('rules_gen').notNull().default(0),
  holidayGen: integer('holiday_gen').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'computation_run_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),
  unique('computation_run_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'computation_run_event_fk', columns: [t.tenantId, t.causeEventId], foreignColumns: [event.tenantId, event.id] }),
  tenantPolicy('computation_run'),
]).enableRLS();

export const deadline = pgTable('deadline', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  subcontractId: uuid('subcontract_id').notNull(),
  invoiceId: uuid('invoice_id'),
  clockCode: text('clock_code').notNull(),
  variant: text('variant').notNull().default(''),
  ruleClockId: uuid('rule_clock_id'),
  computationRunId: uuid('computation_run_id').notNull(),
  state: deadlineState('state').notNull(),
  statutoryDate: civilDate('statutory_date'),
  bound: deadlineBound('bound').notNull().default('exact'),
  path: text('path'),
  actByDate: civilDate('act_by_date'),
  windowEndDate: civilDate('window_end_date'),
  amountCents: cents('amount_cents'),
  missingFacts: text('missing_facts').array().notNull().default(sql`'{}'`),
  flags: text('flags').array().notNull().default(sql`'{}'`),
  withheld: jsonb('withheld').notNull().default(sql`'[]'`),
  notes: text('notes').array().notNull().default(sql`'{}'`),
  triggerEventIds: uuid('trigger_event_ids').array().notNull().default(sql`'{}'`),
  isCurrent: boolean('is_current').notNull().default(true),
  supersededByRunId: uuid('superseded_by_run_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'deadline_rule_clock_id_fkey', columns: [t.ruleClockId], foreignColumns: [ruleClock.id] }),
  unique('deadline_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'deadline_subcontract_fk', columns: [t.tenantId, t.subcontractId], foreignColumns: [subcontract.tenantId, subcontract.id] }),
  foreignKey({ name: 'deadline_invoice_fk', columns: [t.tenantId, t.invoiceId], foreignColumns: [invoice.tenantId, invoice.id] }),
  foreignKey({ name: 'deadline_run_fk', columns: [t.tenantId, t.computationRunId], foreignColumns: [computationRun.tenantId, computationRun.id] }),
  foreignKey({ name: 'deadline_superseded_run_fk', columns: [t.tenantId, t.supersededByRunId], foreignColumns: [computationRun.tenantId, computationRun.id] }),
  check('deadline_computed_check', sql`state <> 'computed' or (statutory_date is not null and missing_facts = '{}' and bound = 'exact')`),
  check('deadline_bound_check', sql`bound <> 'no_later_than' or state = 'provisional'`),
  check('deadline_dated_check', sql`(state in ('computed', 'provisional')) = (statutory_date is not null)`),
  check('deadline_rule_check', sql`state not in ('computed', 'provisional') or rule_clock_id is not null`),
  check('deadline_current_check', sql`is_current or superseded_by_run_id is not null`),
  index('deadline_dashboard_idx').on(t.tenantId, t.actByDate).where(sql`is_current and state in ('computed', 'provisional')`),
  uniqueIndex('deadline_one_current_idx').on(t.tenantId, t.subcontractId, sql`coalesce(invoice_id, '00000000-0000-0000-0000-000000000000'::uuid)`, t.clockCode, t.variant).where(sql`is_current`),
  index('deadline_invoice_current_idx').on(t.tenantId, t.invoiceId).where(sql`is_current`),
  index('deadline_run_idx').on(t.tenantId, t.computationRunId),
  index('deadline_superseded_run_idx').on(t.tenantId, t.supersededByRunId).where(sql`superseded_by_run_id is not null`),
  tenantPolicy('deadline'),
]).enableRLS();

export const flag = pgTable('flag', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  code: text('code').notNull(),
  raisedByRunId: uuid('raised_by_run_id'),
  resolvedAt: ts('resolved_at'),
  resolvedBy: uuid('resolved_by'),
  note: text('note'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'flag_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),
  foreignKey({ name: 'flag_run_fk', columns: [t.tenantId, t.raisedByRunId], foreignColumns: [computationRun.tenantId, computationRun.id] }),
  check('flag_resolution_check', sql`((resolved_at is null) = (resolved_by is null)) and (resolved_at is null or note is not null)`),
  index('flag_open_idx').on(t.tenantId, t.entityType, t.entityId).where(sql`resolved_at is null`),
  tenantPolicy('flag'),
]).enableRLS();

export const reminder = pgTable('reminder', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  deadlineId: uuid('deadline_id').notNull(),
  kind: reminderKind('kind').notNull(),
  sendOn: civilDate('send_on').notNull(),
  status: reminderStatus('status').notNull().default('scheduled'),
  providerMessageId: text('provider_message_id'),
  attempts: integer('attempts').notNull().default(0),
  correlationId: uuid('correlation_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'reminder_deadline_fk', columns: [t.tenantId, t.deadlineId], foreignColumns: [deadline.tenantId, deadline.id] }),
  unique('reminder_deadline_kind_key').on(t.deadlineId, t.kind),
  index('reminder_scheduled_idx').on(t.sendOn).where(sql`status = 'scheduled'`),
  index('reminder_failed_idx').on(t.tenantId, t.status).where(sql`status = 'failed'`),
  tenantPolicy('reminder'),
]).enableRLS();

export const auditEvent = pgTable('audit_event', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid('tenant_id'),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  beforeHash: bytea('before_hash'),
  afterHash: bytea('after_hash'),
  correlationId: uuid('correlation_id').notNull(),
  at: ts('at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'audit_event_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),index('audit_event_tenant_at_idx').on(t.tenantId, t.at.desc()), tenantPolicy('audit_event')]).enableRLS();

export const apiIdempotency = pgTable('api_idempotency', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  requestSha256: text('request_sha256').notNull(),
  statusCode: integer('status_code').notNull(),
  response: jsonb('response').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'api_idempotency_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),unique('api_idempotency_key').on(t.tenantId, t.idempotencyKey), tenantPolicy('api_idempotency')]).enableRLS();

export const rulesGeneration = pgTable('rules_generation', {
  jurisdiction: text('jurisdiction').primaryKey(),
  rulesGen: integer('rules_gen').notNull(),
  holidayGen: integer('holiday_gen').notNull(),
  changedAt: ts('changed_at').notNull().defaultNow(),
});

export const recomputePending = pgTable('recompute_pending', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull(),
  cause: runCause('cause').notNull(),
  rulesGen: integer('rules_gen').notNull(),
  holidayGen: integer('holiday_gen').notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  doneAt: ts('done_at'),
}, (t) => [
  foreignKey({ name: 'recompute_pending_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),
  foreignKey({ name: 'recompute_pending_project_fk', columns: [t.tenantId, t.projectId], foreignColumns: [project.tenantId, project.id] }),
  uniqueIndex('recompute_pending_open_idx').on(t.projectId).where(sql`done_at is null`),
  index('recompute_pending_queue_idx').on(t.createdAt).where(sql`done_at is null`),
  tenantPolicy('recompute_pending'),
]).enableRLS();

// ---------- B2: local sign-in and evidence files (migration 20261111T500000) ----------
export const authTokenKind = pgEnum('auth_token_kind', ['invitation', 'password_reset']);
export const documentPurpose = pgEnum('document_purpose', ['evidence', 'import', 'action_pdf', 'sent_copy', 'export']);
export const scanStatus = pgEnum('scan_status', ['pending', 'clean', 'rejected']);

export const userCredential = pgTable('user_credential', {
  userId: uuid('user_id').primaryKey(),
  passwordHash: text('password_hash'),
  passwordChangedAt: ts('password_changed_at'),
  totpSecretEnc: bytea('totp_secret_enc'),
  totpPendingEnc: bytea('totp_pending_enc'),
  totpEnabledAt: ts('totp_enabled_at'),
  totpLastStep: bigint('totp_last_step', { mode: 'number' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'user_credential_user_id_fkey', columns: [t.userId], foreignColumns: [appUser.id] }),
  check('user_credential_totp_check', sql`(totp_enabled_at is null) = (totp_secret_enc is null)`),
]);

export const authSession = pgTable('auth_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenSha256: bytea('token_sha256').notNull(),
  csrfSha256: bytea('csrf_sha256').notNull(),
  userId: uuid('user_id').notNull(),
  tenantId: uuid('tenant_id'),
  totpVerified: boolean('totp_verified').notNull().default(false),
  restricted: boolean('restricted').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  idleExpiresAt: ts('idle_expires_at').notNull(),
  absoluteExpiresAt: ts('absolute_expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  revokeReason: text('revoke_reason'),
}, (t) => [
  unique('auth_session_token_key').on(t.tokenSha256),
  foreignKey({ name: 'auth_session_user_id_fkey', columns: [t.userId], foreignColumns: [appUser.id] }),
  foreignKey({ name: 'auth_session_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),
  index('auth_session_user_idx').on(t.userId).where(sql`revoked_at is null`),
]);

export const authToken = pgTable('auth_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: authTokenKind('kind').notNull(),
  tokenSha256: bytea('token_sha256').notNull(),
  userId: uuid('user_id').notNull(),
  tenantId: uuid('tenant_id'),
  membershipId: uuid('membership_id'),
  createdBy: uuid('created_by'),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  unique('auth_token_token_key').on(t.tokenSha256),
  foreignKey({ name: 'auth_token_user_id_fkey', columns: [t.userId], foreignColumns: [appUser.id] }),
  foreignKey({ name: 'auth_token_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),
  foreignKey({ name: 'auth_token_membership_id_fkey', columns: [t.membershipId], foreignColumns: [membership.id] }),
  foreignKey({ name: 'auth_token_created_by_fkey', columns: [t.createdBy], foreignColumns: [appUser.id] }),
  check('auth_token_invitation_check', sql`kind <> 'invitation' or (tenant_id is not null and membership_id is not null)`),
  index('auth_token_user_idx').on(t.userId, t.kind).where(sql`used_at is null`),
]);

export const authThrottle = pgTable('auth_throttle', {
  key: text('key').primaryKey(),
  failures: integer('failures').notNull().default(0),
  nextAllowedAt: ts('next_allowed_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const sourceDocument = pgTable('source_document', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  purpose: documentPurpose('purpose').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  storageKey: text('storage_key').notNull(),
  sha256: bytea('sha256').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  scanStatus: scanStatus('scan_status').notNull().default('pending'),
  expiresAt: ts('expires_at'),
  uploadedBy: uuid('uploaded_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'source_document_tenant_id_fkey', columns: [t.tenantId], foreignColumns: [tenant.id] }),
  foreignKey({ name: 'source_document_uploaded_by_fkey', columns: [t.uploadedBy], foreignColumns: [appUser.id] }),
  unique('source_document_storage_key_key').on(t.storageKey),
  unique('source_document_tenant_id_key').on(t.tenantId, t.id),
  check('source_document_entity_type_check', sql`entity_type in ('project', 'subcontract', 'invoice', 'event')`),
  check('source_document_bytes_check', sql`bytes > 0 and bytes <= 10485760`),
  check('source_document_key_check', sql`storage_key like 't/' || tenant_id::text || '/' || purpose::text || '/' || entity_id::text || '/%'`),
  index('source_document_entity_idx').on(t.tenantId, t.entityType, t.entityId),
  index('source_document_expires_idx').on(t.expiresAt).where(sql`expires_at is not null`),
  tenantPolicy('source_document'),
]).enableRLS();
