-- Round-3 hardening: recompute_pending is a tenant-owned table like every other one. It gets a
-- direct tenant foreign key, FORCE ROW LEVEL SECURITY and the standard isolation policy, so the
-- runtime role sees and changes only the rows of the tenant in context.
-- The worker still drains across tenants, but only through two SECURITY DEFINER functions that
-- return queue identifiers (never last_error or other row text): it claims rows, then records the
-- outcome of each row inside that row's own tenant transaction.
alter table recompute_pending
  add constraint recompute_pending_tenant_id_fkey foreign key (tenant_id) references tenant(id);

alter table recompute_pending enable row level security;
alter table recompute_pending force row level security;
create policy recompute_pending_isolation on recompute_pending
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());

grant insert on recompute_pending to payclock_app;

-- Claim up to p_limit open rows, oldest first, skipping rows another drain holds; bumps attempts.
create function claim_recompute_pending(p_limit integer)
returns table (id uuid, tenant_id uuid, project_id uuid, cause run_cause, rules_gen integer, holiday_gen integer)
language sql security definer set search_path = public as $$
  update recompute_pending r set attempts = r.attempts + 1
  where r.id in (select q.id from recompute_pending q where q.done_at is null order by q.created_at limit p_limit for update skip locked)
  returning r.id, r.tenant_id, r.project_id, r.cause, r.rules_gen, r.holiday_gen
$$;

-- Number of open rows across tenants (a count only).
create function open_recompute_pending_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from recompute_pending where done_at is null
$$;

revoke all on function claim_recompute_pending(integer) from public;
revoke all on function open_recompute_pending_count() from public;
grant execute on function claim_recompute_pending(integer) to payclock_app;
grant execute on function open_recompute_pending_count() to payclock_app;
