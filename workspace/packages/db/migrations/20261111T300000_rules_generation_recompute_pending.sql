-- B1-005 (round 2): a rule or holiday change and a durable pending-recompute record per project
-- commit together; every computation records the rule and holiday generation it used, so a read
-- can tell a date computed under a superseded version and refuse to present it as current.
create table rules_generation (
  jurisdiction text primary key,
  rules_gen integer not null,
  holiday_gen integer not null,
  changed_at timestamptz not null default now()
);
insert into rules_generation (jurisdiction, rules_gen, holiday_gen) values ('ON', 1, 1);

-- Runs written before this migration carry generation 0, so they read as stale until recomputed.
alter table computation_run add column rules_gen integer not null default 0;
alter table computation_run add column holiday_gen integer not null default 0;

create table recompute_pending (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  cause run_cause not null,
  rules_gen integer not null,
  holiday_gen integer not null,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  constraint recompute_pending_project_fk foreign key (tenant_id, project_id) references project(tenant_id, id)
);
create unique index recompute_pending_open_idx on recompute_pending (project_id) where done_at is null;
create index recompute_pending_queue_idx on recompute_pending (created_at) where done_at is null;
insert into recompute_pending (tenant_id, project_id, cause, rules_gen, holiday_gen)
  select tenant_id, id, 'rule_version', 1, 1 from project;

-- Stale scan across tenants for the worker. SECURITY DEFINER so the runtime role can queue work it
-- cannot read (it returns only a count; it reads no tenant data out).
create function enqueue_stale_recomputes() returns integer language sql security definer set search_path = public as $$
  with ins as (
    insert into recompute_pending (tenant_id, project_id, cause, rules_gen, holiday_gen)
    select distinct s.tenant_id, s.project_id, 'rule_version'::run_cause, g.rules_gen, g.holiday_gen
    from deadline d
    join computation_run c on c.id = d.computation_run_id
    join subcontract s on s.id = d.subcontract_id
    cross join rules_generation g
    where g.jurisdiction = 'ON' and d.is_current and (c.rules_gen < g.rules_gen or c.holiday_gen < g.holiday_gen)
    on conflict (project_id) where done_at is null do nothing
    returning 1)
  select count(*)::integer from ins
$$;
revoke all on function enqueue_stale_recomputes() from public;
grant execute on function enqueue_stale_recomputes() to payclock_app;

grant select on rules_generation to payclock_app;
grant select, update on recompute_pending to payclock_app;
