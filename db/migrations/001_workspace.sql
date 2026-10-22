-- Fieldquote schema for plain Postgres (Aiven, Neon, local). Everything lives in
-- the "fieldquote" schema so it can share a database with unrelated apps.
--
-- Two database identities:
--   * the migration/connection user (owner): server-only writes, sessions and
--     encrypted credentials. It may have BYPASSRLS, so it is never used for
--     ordinary tenant reads.
--   * fieldquote_tenant (NOLOGIN): every tenant read runs inside a transaction
--     with SET LOCAL ROLE fieldquote_tenant and fieldquote.user_id set from the
--     verified session. It has SELECT only and row-level security applies.
create schema if not exists fieldquote;
do $$ begin
  create role fieldquote_tenant nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  execute format('grant fieldquote_tenant to %I with set true, inherit false', current_user);
end $$;

create table fieldquote.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email)) and length(email) between 3 and 250),
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table fieldquote.sessions (
  token_hash text primary key,
  user_id uuid not null references fieldquote.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user on fieldquote.sessions(user_id);
create table fieldquote.login_failures (
  id bigint generated always as identity primary key,
  email text not null,
  created_at timestamptz not null default now()
);
create index login_failures_email on fieldquote.login_failures(email, created_at desc);

create table fieldquote.companies (
  id uuid primary key,
  config jsonb not null check (config->>'id' = id::text)
);
create table fieldquote.memberships (
  user_id uuid primary key references fieldquote.users(id) on delete cascade,
  company_id uuid not null references fieldquote.companies(id),
  role text not null check (role in ('owner','approver')),
  display_name text not null
);
create table fieldquote.rates (
  company_id uuid not null references fieldquote.companies(id), code text not null, data jsonb not null,
  primary key(company_id,code), check (data->>'code' = code)
);
create table fieldquote.customers (
  company_id uuid not null references fieldquote.companies(id), id text not null, data jsonb not null,
  primary key(company_id,id), check(data->>'id' = id)
);
create table fieldquote.enquiries (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references fieldquote.companies(id),
  raw_text text not null check(length(raw_text) between 10 and 20000),
  created_at timestamptz not null default now(), state text not null default 'pending' check(state in ('pending','processing','completed','failed')),
  started_at timestamptz, attempts integer not null default 0, failure_code text,
  unique(company_id,id)
);
create table fieldquote.quotes (
  id uuid primary key, company_id uuid not null references fieldquote.companies(id), enquiry_id uuid not null,
  customer_id text, version integer not null check(version > 0), data jsonb not null,
  created_at timestamptz not null default now(), unique(company_id,enquiry_id),
  foreign key(company_id,enquiry_id) references fieldquote.enquiries(company_id,id),
  foreign key(company_id,customer_id) references fieldquote.customers(company_id,id),
  check(data->>'id' = id::text), check((data->>'version')::integer = version),
  check(data->>'status' in ('draft','needs_review','site_visit_required','declined','approved'))
);
create table fieldquote.company_ai_credentials (
  company_id uuid primary key references fieldquote.companies(id), provider text not null default 'anthropic' check(provider='anthropic'),
  ciphertext text not null, nonce text not null, tag text not null, suffix text not null, key_version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table fieldquote.audit_events (
  id bigint generated always as identity primary key, company_id uuid not null references fieldquote.companies(id),
  actor_id uuid not null references fieldquote.users(id), entity_id text not null, event text not null, created_at timestamptz not null default now()
);
create index quotes_company_created on fieldquote.quotes(company_id,created_at desc);
create index enquiries_company_started on fieldquote.enquiries(company_id,started_at desc);
create index audit_company_event on fieldquote.audit_events(company_id,event,created_at desc);

create function fieldquote.current_user_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('fieldquote.user_id', true), '')::uuid
$$;

alter table fieldquote.companies enable row level security;
alter table fieldquote.memberships enable row level security;
alter table fieldquote.rates enable row level security;
alter table fieldquote.customers enable row level security;
alter table fieldquote.enquiries enable row level security;
alter table fieldquote.quotes enable row level security;
alter table fieldquote.company_ai_credentials enable row level security;
alter table fieldquote.audit_events enable row level security;
create policy own_membership on fieldquote.memberships for select to fieldquote_tenant using(user_id = fieldquote.current_user_id());
create policy company_read on fieldquote.companies for select to fieldquote_tenant using(id in (select company_id from fieldquote.memberships where user_id = fieldquote.current_user_id()));
create policy rates_read on fieldquote.rates for select to fieldquote_tenant using(company_id in (select company_id from fieldquote.memberships where user_id = fieldquote.current_user_id()));
create policy customers_read on fieldquote.customers for select to fieldquote_tenant using(company_id in (select company_id from fieldquote.memberships where user_id = fieldquote.current_user_id()));
create policy enquiries_read on fieldquote.enquiries for select to fieldquote_tenant using(company_id in (select company_id from fieldquote.memberships where user_id = fieldquote.current_user_id()));
create policy quotes_read on fieldquote.quotes for select to fieldquote_tenant using(company_id in (select company_id from fieldquote.memberships where user_id = fieldquote.current_user_id()));
create policy audit_read on fieldquote.audit_events for select to fieldquote_tenant using(company_id in (select company_id from fieldquote.memberships where user_id = fieldquote.current_user_id()));
-- The tenant role reads business data only. No users, sessions, login records or
-- credentials, and no direct writes.
revoke all on all tables in schema fieldquote from public;
grant usage on schema fieldquote to fieldquote_tenant;
grant select on fieldquote.companies,fieldquote.memberships,fieldquote.rates,fieldquote.customers,fieldquote.enquiries,fieldquote.quotes,fieldquote.audit_events to fieldquote_tenant;
revoke all on function fieldquote.current_user_id() from public;
grant execute on function fieldquote.current_user_id() to fieldquote_tenant;

create function fieldquote.claim_generation(p_company uuid,p_actor uuid,p_enquiry uuid) returns text
language plpgsql security invoker set search_path = '' as $$
declare item fieldquote.enquiries; calls integer;
begin
  if not exists(select 1 from fieldquote.memberships where user_id=p_actor and company_id=p_company) then raise exception 'FORBIDDEN'; end if;
  -- Serialize per company to make the rolling generation limit concurrency-safe.
  perform 1 from fieldquote.companies where id=p_company for update;
  select * into item from fieldquote.enquiries where id=p_enquiry and company_id=p_company for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if item.state='completed' then return 'completed'; end if;
  if item.state='processing' and item.started_at > now()-interval '2 minutes' then raise exception 'BUSY'; end if;
  select count(*) into calls from fieldquote.audit_events where company_id=p_company and event='generation_started' and created_at>now()-interval '10 minutes';
  if calls>=10 then raise exception 'RATE_LIMIT'; end if;
  update fieldquote.enquiries set state='processing',started_at=now(),attempts=attempts+1,failure_code=null where id=p_enquiry and company_id=p_company;
  insert into fieldquote.audit_events(company_id,actor_id,entity_id,event) values(p_company,p_actor,p_enquiry::text,'generation_started');
  return 'claimed';
end $$;
revoke all on function fieldquote.claim_generation(uuid,uuid,uuid) from public;

create function fieldquote.save_quote(p_company uuid,p_actor uuid,p_data jsonb,p_expected integer default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare previous fieldquote.quotes; actor_role text; qid uuid; eid uuid; new_status text;
begin
  select role into actor_role from fieldquote.memberships where user_id=p_actor and company_id=p_company;
  if actor_role is null then raise exception 'FORBIDDEN'; end if;
  qid := (p_data->>'id')::uuid; eid := (p_data->>'enquiryId')::uuid; new_status := p_data->>'status';
  if not exists(select 1 from fieldquote.enquiries where id=eid and company_id=p_company) then raise exception 'NOT_FOUND'; end if;
  if p_expected is null then
    if (p_data->>'version')::integer<>1 or new_status='approved' then raise exception 'INVALID_STATE'; end if;
    insert into fieldquote.quotes(id,company_id,enquiry_id,customer_id,version,data) values(qid,p_company,eid,p_data->>'customerId',1,p_data);
    update fieldquote.enquiries set state='completed',failure_code=null where id=eid and company_id=p_company;
  else
    select * into previous from fieldquote.quotes where id=qid and company_id=p_company for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if previous.version<>p_expected then raise exception 'CONFLICT'; end if;
    if (p_data->>'version')::integer<>p_expected+1 or eid<>previous.enquiry_id then raise exception 'INVALID_STATE'; end if;
    if new_status='approved' then
      if previous.data->>'status' not in ('draft','needs_review') then raise exception 'INVALID_STATE'; end if;
      if p_data->'lines' is distinct from previous.data->'lines' or p_data->'issues' is distinct from previous.data->'issues' then raise exception 'INVALID_STATE'; end if;
      if p_data->>'totalPence' is null or p_data->>'approvedBy' is null or p_data->>'approvedAt' is null then raise exception 'UNRESOLVED'; end if;
      if exists(select 1 from jsonb_array_elements(p_data->'issues') i where (i->>'blocking')::boolean and length(trim(coalesce(i->>'resolution',''))) < 5) then raise exception 'UNRESOLVED'; end if;
      if exists(select 1 from jsonb_array_elements(p_data->'lines') l where not (l->>'excluded')::boolean and (l->>'ratePence' is null or l->>'quantity' is null)) then raise exception 'UNRESOLVED'; end if;
    else
      if new_status not in ('draft','needs_review') or p_data->>'approvedAt' is not null or p_data->>'approvedBy' is not null then raise exception 'INVALID_STATE'; end if;
      if actor_role<>'owner' and exists(select 1 from jsonb_array_elements(p_data->'lines') n left join jsonb_array_elements(previous.data->'lines') o on n->>'id'=o->>'id' where n->'ratePence' is distinct from o->'ratePence') then raise exception 'FORBIDDEN'; end if;
    end if;
    update fieldquote.quotes set data=p_data,version=p_expected+1 where id=qid and company_id=p_company;
  end if;
  insert into fieldquote.audit_events(company_id,actor_id,entity_id,event) values(p_company,p_actor,qid::text,case when new_status='approved' then 'quote_approved' when p_expected is null then 'quote_generated' else 'quote_edited' end);
  return p_data;
end $$;
revoke all on function fieldquote.save_quote(uuid,uuid,jsonb,integer) from public;
