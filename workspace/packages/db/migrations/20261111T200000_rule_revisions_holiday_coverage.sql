-- B1-005: a changed rule version becomes a new revision (the old one is retired, never edited);
-- B1-003: the years the holiday table covers are recorded, and the engine refuses to count outside them.
alter table rule_version add column revision integer not null default 1;
alter table rule_version add column content_sha256 text;
alter table rule_version drop constraint rule_version_code_key;
alter table rule_version add constraint rule_version_code_revision_key unique (code, revision);
create unique index rule_version_one_live_idx on rule_version (code) where status <> 'retired';

create table holiday_coverage (
  jurisdiction text not null,
  year integer not null,
  source text not null,
  created_at timestamptz not null default now(),
  primary key (jurisdiction, year)
);
grant select on holiday_coverage to payclock_app;
