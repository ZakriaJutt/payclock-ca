-- PayClock B1 core schema (schema.md sections 2-7). Runs as the migrator (table owner).
-- Runtime role: payclock_app (NOSUPERUSER NOBYPASSRLS), created by scripts/db-bootstrap.ts.
-- Tables not needed by the B1 core path are not created yet (see verification report, B1 section).

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------- enums ----------
create type plan_kind as enum ('pilot', 'launch', 'starter', 'pro', 'business');
create type subscription_status as enum ('none', 'active', 'past_due', 'read_only', 'cancelled');
create type tenant_status as enum ('active', 'locked', 'deleting');
create type member_role as enum ('owner', 'member', 'viewer');
create type member_status as enum ('invited', 'active', 'removed');
create type tri_state as enum ('yes', 'no', 'unknown');
create type invoice_status as enum ('open', 'paid', 'written_off');
create type scope_type as enum ('project', 'subcontract', 'invoice');
create type event_type as enum (
  'EV-01','EV-02','EV-03','EV-04','EV-05','EV-06','EV-07','EV-08','EV-09','EV-10',
  'EV-11','EV-12','EV-13','EV-14','EV-15','EV-16','EV-17','EV-18','EV-19');
create type certainty as enum ('confirmed', 'estimated', 'unknown');
create type notice_form as enum ('1.2', '1.3');
create type rule_status as enum ('draft', 'approved', 'retired');
create type run_cause as enum ('new_event', 'correction', 'rule_version', 'holiday_table', 'import');
create type run_status as enum ('succeeded', 'discarded', 'failed');
create type deadline_state as enum ('computed', 'provisional', 'not_computable', 'not_applicable');
create type deadline_bound as enum ('exact', 'no_later_than');
create type reminder_kind as enum ('actby_d14', 'actby_d7', 'actby_d3', 'actby_d0', 'last_d5', 'last_d2', 'last_d0', 'due', 'due_plus3', 'urgent_moved_earlier');
create type reminder_status as enum ('scheduled', 'sent', 'cancelled', 'failed');

-- ---------- helpers ----------
create function app_current_tenant() returns uuid language sql stable as
$$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- ---------- tenant and identity ----------
create table tenant (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade text,
  digest_weekday smallint not null default 1 constraint tenant_digest_weekday_check check (digest_weekday between 0 and 6),
  disclaimer_version text,
  disclaimer_accepted_at timestamptz,
  plan plan_kind not null default 'pilot',
  subscription_status subscription_status not null default 'none',
  status tenant_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table app_user (
  id uuid primary key,
  email citext not null constraint app_user_email_key unique,
  display_name text not null,
  is_operator boolean not null default false,
  created_at timestamptz not null default now()
);

create table membership (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  user_id uuid not null references app_user(id),
  role member_role not null,
  status member_status not null default 'invited',
  created_at timestamptz not null default now(),
  constraint membership_tenant_user_key unique (tenant_id, user_id)
);

-- ---------- work records ----------
create table project (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  name text not null,
  contractor_name text not null,
  owner_name text,
  premises_leased tri_state not null default 'unknown',
  lease_first_entered_on date,
  municipal_interest tri_state not null default 'unknown',
  fact_version integer not null default 0,
  created_at timestamptz not null default now(),
  constraint project_tenant_id_key unique (tenant_id, id)
);

create table subcontract (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  reference text,
  has_sub_subs boolean,
  holdback_rate numeric(5,4) not null default 0.1000,
  fact_version integer not null default 0,
  created_at timestamptz not null default now(),
  constraint subcontract_tenant_id_key unique (tenant_id, id),
  constraint subcontract_project_fk foreign key (tenant_id, project_id) references project(tenant_id, id)
);

create table invoice (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  subcontract_id uuid not null,
  number text not null,
  given_to_contractor_on date,
  amount_cents bigint not null constraint invoice_amount_check check (amount_cents >= 0),
  holdback_cents bigint not null default 0 constraint invoice_holdback_check check (holdback_cents >= 0 and holdback_cents <= amount_cents),
  status invoice_status not null default 'open',
  fact_version integer not null default 0,
  created_at timestamptz not null default now(),
  constraint invoice_tenant_id_key unique (tenant_id, id),
  constraint invoice_number_key unique (tenant_id, subcontract_id, number),
  constraint invoice_subcontract_fk foreign key (tenant_id, subcontract_id) references subcontract(tenant_id, id)
);

-- ---------- facts ----------
create table event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  scope_type scope_type not null,
  scope_id uuid not null,
  event_type event_type not null,
  series_key text not null default 'main',
  occurred_on date,
  received_on date,
  delivery_method text,
  entered_by_operator boolean not null default false,
  certainty certainty not null,
  amount_cents bigint constraint event_amount_check check (amount_cents is null or amount_cents >= 0),
  notice_form notice_form,
  document_id uuid,
  version integer not null default 1,
  supersedes_id uuid,
  superseded_at timestamptz,
  reason text,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  constraint event_tenant_id_key unique (tenant_id, id),
  constraint event_supersedes_fk foreign key (tenant_id, supersedes_id) references event(tenant_id, id),
  constraint event_unknown_check check ((certainty = 'unknown') = (occurred_on is null)),
  constraint event_operator_check check (not entered_by_operator or certainty <> 'confirmed'),
  constraint event_reason_check check (supersedes_id is null or (reason is not null and length(btrim(reason)) > 0)),
  constraint event_notice_form_check check ((event_type = 'EV-05') = (notice_form is not null)),
  constraint event_received_check check (received_on is null or event_type = 'EV-05'),
  constraint event_scope_check check (
    (scope_type = 'invoice' and event_type in ('EV-01','EV-02','EV-03','EV-04','EV-05','EV-06'))
    or (scope_type = 'subcontract' and event_type in ('EV-07','EV-10','EV-14','EV-15','EV-16'))
    or (scope_type = 'project' and event_type in ('EV-08','EV-09','EV-11','EV-12','EV-13','EV-17','EV-18','EV-19')))
);

-- ---------- rules (global, no tenant) ----------
create table legal_signoff (
  id uuid primary key default gen_random_uuid(),
  reviewer_name text not null,
  licence_jurisdiction text not null,
  memo_sha256 bytea not null,
  signed_on date not null,
  scope_note text,
  created_at timestamptz not null default now()
);

create table rule_version (
  id uuid primary key default gen_random_uuid(),
  code text not null constraint rule_version_code_key unique,
  family text not null,
  jurisdiction text not null default 'ON',
  effective_from date not null,
  effective_to date,
  status rule_status not null default 'draft',
  legal_source text not null,
  signoff_id uuid references legal_signoff(id),
  created_at timestamptz not null default now(),
  constraint rule_version_signoff_check check (status <> 'approved' or signoff_id is not null)
);

create table rule_clock (
  id uuid primary key default gen_random_uuid(),
  rule_version_id uuid not null references rule_version(id),
  clock_code text not null,
  variant text not null default '',
  trigger_spec jsonb not null,
  pending_question text,
  offset_days integer not null,
  window_end_days integer,
  extend_on_holiday boolean not null,
  act_by_buffer_days integer not null default 0,
  section_ref text not null,
  applies_when jsonb,
  computed boolean not null default true,
  not_computed_reason text,
  created_at timestamptz not null default now(),
  constraint rule_clock_key unique (rule_version_id, clock_code, variant)
);

create table holiday (
  jurisdiction text not null,
  day date not null,
  name text not null,
  source text not null,
  created_at timestamptz not null default now(),
  primary key (jurisdiction, day)
);

create table interest_rate (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  effective_from date not null,
  effective_to date,
  annual_rate numeric(6,4) not null,
  source text not null,
  created_at timestamptz not null default now()
);

-- ---------- computation ----------
create table computation_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  scope_type scope_type not null,
  scope_id uuid not null,
  cause run_cause not null,
  cause_event_id uuid,
  fact_version_read integer not null,
  inputs_hash bytea not null,
  engine_version text not null,
  status run_status not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint computation_run_tenant_id_key unique (tenant_id, id),
  constraint computation_run_event_fk foreign key (tenant_id, cause_event_id) references event(tenant_id, id)
);

create table deadline (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  subcontract_id uuid not null,
  invoice_id uuid,
  clock_code text not null,
  variant text not null default '',
  rule_clock_id uuid references rule_clock(id),
  computation_run_id uuid not null,
  state deadline_state not null,
  statutory_date date,
  bound deadline_bound not null default 'exact',
  path text,
  act_by_date date,
  window_end_date date,
  amount_cents bigint,
  missing_facts text[] not null default '{}',
  flags text[] not null default '{}',
  withheld jsonb not null default '[]',
  notes text[] not null default '{}',
  trigger_event_ids uuid[] not null default '{}',
  is_current boolean not null default true,
  superseded_by_run_id uuid,
  created_at timestamptz not null default now(),
  constraint deadline_tenant_id_key unique (tenant_id, id),
  constraint deadline_subcontract_fk foreign key (tenant_id, subcontract_id) references subcontract(tenant_id, id),
  constraint deadline_invoice_fk foreign key (tenant_id, invoice_id) references invoice(tenant_id, id),
  constraint deadline_run_fk foreign key (tenant_id, computation_run_id) references computation_run(tenant_id, id),
  constraint deadline_superseded_run_fk foreign key (tenant_id, superseded_by_run_id) references computation_run(tenant_id, id),
  constraint deadline_computed_check check (state <> 'computed' or (statutory_date is not null and missing_facts = '{}' and bound = 'exact')),
  constraint deadline_bound_check check (bound <> 'no_later_than' or state = 'provisional'),
  constraint deadline_dated_check check ((state in ('computed', 'provisional')) = (statutory_date is not null)),
  constraint deadline_rule_check check (state not in ('computed', 'provisional') or rule_clock_id is not null),
  constraint deadline_current_check check (is_current or superseded_by_run_id is not null)
);

create table flag (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  entity_type text not null,
  entity_id uuid not null,
  code text not null,
  raised_by_run_id uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  note text,
  created_at timestamptz not null default now(),
  constraint flag_run_fk foreign key (tenant_id, raised_by_run_id) references computation_run(tenant_id, id),
  constraint flag_resolution_check check ((resolved_at is null) = (resolved_by is null) and (resolved_at is null or note is not null))
);

create table reminder (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  deadline_id uuid not null,
  kind reminder_kind not null,
  send_on date not null,
  status reminder_status not null default 'scheduled',
  provider_message_id text,
  attempts integer not null default 0,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint reminder_deadline_fk foreign key (tenant_id, deadline_id) references deadline(tenant_id, id),
  constraint reminder_deadline_kind_key unique (deadline_id, kind)
);

-- ---------- operations ----------
create table audit_event (
  id bigint generated always as identity primary key,
  tenant_id uuid references tenant(id),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_hash bytea,
  after_hash bytea,
  correlation_id uuid not null,
  at timestamptz not null default now()
);

create table api_idempotency (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  idempotency_key text not null,
  method text not null,
  path text not null,
  request_sha256 text not null,
  status_code integer not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  constraint api_idempotency_key unique (tenant_id, idempotency_key)
);

-- ---------- indexes (schema.md section 4) ----------
create index deadline_dashboard_idx on deadline (tenant_id, act_by_date) where is_current and state in ('computed', 'provisional');
create unique index deadline_one_current_idx on deadline (tenant_id, subcontract_id, coalesce(invoice_id, '00000000-0000-0000-0000-000000000000'::uuid), clock_code, variant) where is_current;
create index deadline_invoice_current_idx on deadline (tenant_id, invoice_id) where is_current;
create index deadline_run_idx on deadline (tenant_id, computation_run_id);
create index deadline_superseded_run_idx on deadline (tenant_id, superseded_by_run_id) where superseded_by_run_id is not null;
create unique index event_current_idx on event (tenant_id, scope_type, scope_id, event_type, series_key) where superseded_at is null;
create index event_history_idx on event (tenant_id, scope_type, scope_id, created_at);
create index reminder_scheduled_idx on reminder (send_on) where status = 'scheduled';
create index reminder_failed_idx on reminder (tenant_id, status) where status = 'failed';
create index invoice_status_idx on invoice (tenant_id, status);
create index flag_open_idx on flag (tenant_id, entity_type, entity_id) where resolved_at is null;
create index audit_event_tenant_at_idx on audit_event (tenant_id, at desc);
create index rule_version_selection_idx on rule_version (jurisdiction, effective_from) where status = 'approved';
create index subcontract_project_idx on subcontract (tenant_id, project_id);
create index invoice_subcontract_idx on invoice (tenant_id, subcontract_id);
create index membership_user_idx on membership (user_id);

-- ---------- integrity triggers ----------
-- Events are append-only: the only permitted update sets superseded_at once; no delete.
create function event_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'event rows are never deleted' using errcode = 'P0001';
  end if;
  if old.superseded_at is not null or new.superseded_at is null
     or (to_jsonb(new) - 'superseded_at') <> (to_jsonb(old) - 'superseded_at') then
    raise exception 'event rows are append-only (only superseded_at may be set, once)' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger event_append_only before update or delete on event for each row execute function event_append_only();

-- The event's scope must exist in the same tenant (polymorphic reference). Runs as the caller, so
-- row-level security hides other tenants' rows and a foreign scope fails.
create function event_scope_exists() returns trigger language plpgsql as $$
declare found boolean;
begin
  if new.scope_type = 'project' then
    select exists(select 1 from project where id = new.scope_id and tenant_id = new.tenant_id) into found;
  elsif new.scope_type = 'subcontract' then
    select exists(select 1 from subcontract where id = new.scope_id and tenant_id = new.tenant_id) into found;
  else
    select exists(select 1 from invoice where id = new.scope_id and tenant_id = new.tenant_id) into found;
  end if;
  if not found then
    raise exception 'event scope % % not found in tenant', new.scope_type, new.scope_id using errcode = '23503';
  end if;
  return new;
end $$;
create trigger event_scope_exists before insert on event for each row execute function event_scope_exists();

-- Deadlines are recomputed, never edited: only the supersession markers may change, once.
create function deadline_supersede_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'deadline rows are never deleted' using errcode = 'P0001';
  end if;
  if not old.is_current or new.is_current or new.superseded_by_run_id is null
     or (to_jsonb(new) - 'is_current' - 'superseded_by_run_id') <> (to_jsonb(old) - 'is_current' - 'superseded_by_run_id') then
    raise exception 'deadline rows may only be superseded' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger deadline_supersede_only before update or delete on deadline for each row execute function deadline_supersede_only();

create function computation_run_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'computation_run rows are immutable' using errcode = 'P0001';
end $$;
create trigger computation_run_immutable before update or delete on computation_run for each row execute function computation_run_immutable();

create function audit_insert_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_event is insert-only' using errcode = 'P0001';
end $$;
create trigger audit_insert_only before update or delete on audit_event for each row execute function audit_insert_only();

-- Approved rule versions and their clocks are immutable (L-01, AD-03).
create function rule_version_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then raise exception 'approved rule versions are never deleted' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.status = 'approved' and (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status') then
    raise exception 'approved rule versions are immutable' using errcode = 'P0001';
  end if;
  if old.status = 'approved' and new.status not in ('approved', 'retired') then
    raise exception 'an approved rule version can only be retired' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger rule_version_guard before update or delete on rule_version for each row execute function rule_version_guard();

create function rule_clock_guard() returns trigger language plpgsql as $$
declare st rule_status;
begin
  select status into st from rule_version where id = coalesce(old.rule_version_id, new.rule_version_id);
  if st = 'approved' or (tg_op <> 'INSERT' and st <> 'draft') then
    raise exception 'rule clocks of a non-draft version are immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger rule_clock_guard before insert or update or delete on rule_clock for each row execute function rule_clock_guard();

-- No overlapping interest-rate ranges (btree_gist is not available here, so a trigger replaces the
-- exclusion constraint named in schema.md).
create function interest_rate_no_overlap() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from interest_rate r
    where r.jurisdiction = new.jurisdiction and r.id <> new.id
      and daterange(r.effective_from, r.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]')
  ) then
    raise exception 'overlapping interest-rate range' using errcode = '23P01';
  end if;
  return new;
end $$;
create trigger interest_rate_no_overlap before insert or update on interest_rate for each row execute function interest_rate_no_overlap();

-- ---------- row-level security ----------
alter table tenant enable row level security;
alter table tenant force row level security;
create policy tenant_isolation on tenant using (id = app_current_tenant()) with check (id = app_current_tenant());

do $$
declare t text;
begin
  foreach t in array array['membership','project','subcontract','invoice','event','computation_run','deadline','flag','reminder','audit_event','api_idempotency'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I on %I using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant())', t || '_isolation', t);
  end loop;
end $$;

-- ---------- grants for the runtime role ----------
grant usage on schema public to payclock_app;
grant select, insert, update on tenant, membership, project, subcontract, invoice, event, computation_run, deadline, flag, reminder, api_idempotency to payclock_app;
grant select, insert on audit_event to payclock_app;
grant select on app_user, legal_signoff, rule_version, rule_clock, holiday, interest_rate to payclock_app;
grant execute on function app_current_tenant() to payclock_app;
