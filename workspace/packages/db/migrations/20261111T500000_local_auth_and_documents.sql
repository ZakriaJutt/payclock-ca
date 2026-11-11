-- B2 (T-2.2.2, T-2.2.4): local sign-in (password plus TOTP, TRD 8.1 / AD-08) with database
-- sessions, single-use invitation and reset links, sign-in throttling; evidence files
-- (`source_document`) stored through the S3 API.
--
-- Identity tables are global like `app_user`: a session or a link is looked up by its token hash
-- before any tenant is known. They hold no tenant business data; tokens are stored as SHA-256
-- hashes only and the TOTP secret is encrypted by the application (AES-256-GCM).

create type auth_token_kind as enum ('invitation', 'password_reset');
create type document_purpose as enum ('evidence', 'import', 'action_pdf', 'sent_copy', 'export');
create type scan_status as enum ('pending', 'clean', 'rejected');

create table user_credential (
  user_id uuid primary key references app_user(id),
  password_hash text,
  password_changed_at timestamptz,
  totp_secret_enc bytea,
  totp_pending_enc bytea,
  totp_enabled_at timestamptz,
  totp_last_step bigint,
  created_at timestamptz not null default now(),
  constraint user_credential_totp_check check ((totp_enabled_at is null) = (totp_secret_enc is null))
);

create table auth_session (
  id uuid primary key default gen_random_uuid(),
  token_sha256 bytea not null constraint auth_session_token_key unique,
  csrf_sha256 bytea not null,
  user_id uuid not null references app_user(id),
  tenant_id uuid references tenant(id),
  totp_verified boolean not null default false,
  restricted boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text
);
create index auth_session_user_idx on auth_session (user_id) where revoked_at is null;

create table auth_token (
  id uuid primary key default gen_random_uuid(),
  kind auth_token_kind not null,
  token_sha256 bytea not null constraint auth_token_token_key unique,
  user_id uuid not null references app_user(id),
  tenant_id uuid references tenant(id),
  membership_id uuid references membership(id),
  created_by uuid references app_user(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint auth_token_invitation_check check (kind <> 'invitation' or (tenant_id is not null and membership_id is not null))
);
create index auth_token_user_idx on auth_token (user_id, kind) where used_at is null;

-- Failed-attempt counters per key (account or client address); delays grow, nothing hard-locks.
create table auth_throttle (
  key text primary key,
  failures integer not null default 0,
  next_allowed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Active memberships of one user across tenants (identifiers and role only), for sign-in tenant
-- selection before a tenant context exists.
create function user_active_memberships(p_user uuid) returns table (tenant_id uuid, role member_role)
language sql stable security definer set search_path = public as $$
  select m.tenant_id, m.role from membership m join tenant t on t.id = m.tenant_id
  where m.user_id = p_user and m.status = 'active' and t.status = 'active' order by m.created_at
$$;

-- Sign-in audit rows (TRD 8.5, V16.3.1) may have no tenant (unknown account, failure before a
-- tenant is chosen); the runtime role cannot insert those under RLS, so it uses this function.
create function record_auth_event(p_action text, p_actor uuid, p_tenant uuid, p_correlation uuid) returns void
language sql security definer set search_path = public as $$
  insert into audit_event (tenant_id, actor_id, action, entity_type, entity_id, correlation_id)
  values (p_tenant, p_actor, p_action, 'auth', p_actor, p_correlation)
$$;

-- ---------- evidence files ----------
create table source_document (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  purpose document_purpose not null,
  entity_type text not null constraint source_document_entity_type_check check (entity_type in ('project', 'subcontract', 'invoice', 'event')),
  entity_id uuid not null,
  storage_key text not null constraint source_document_storage_key_key unique,
  sha256 bytea not null,
  mime text not null,
  bytes integer not null constraint source_document_bytes_check check (bytes > 0 and bytes <= 10485760),
  scan_status scan_status not null default 'pending',
  expires_at timestamptz,
  uploaded_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  constraint source_document_tenant_id_key unique (tenant_id, id),
  constraint source_document_key_check check (storage_key like 't/' || tenant_id::text || '/' || purpose::text || '/' || entity_id::text || '/%')
);
create index source_document_entity_idx on source_document (tenant_id, entity_type, entity_id);
create index source_document_expires_idx on source_document (expires_at) where expires_at is not null;
alter table source_document enable row level security;
alter table source_document force row level security;
create policy source_document_isolation on source_document using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());

-- ---------- grants ----------
grant select, insert, update on user_credential, auth_session, auth_token, auth_throttle to payclock_app;
grant delete on auth_throttle to payclock_app;
grant insert, update (display_name) on app_user to payclock_app;
grant select, insert, update on source_document to payclock_app;
revoke all on function user_active_memberships(uuid) from public;
revoke all on function record_auth_event(text, uuid, uuid, uuid) from public;
grant execute on function user_active_memberships(uuid) to payclock_app;
grant execute on function record_auth_event(text, uuid, uuid, uuid) to payclock_app;
