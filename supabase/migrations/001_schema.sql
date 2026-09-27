-- Stamply schema v1 — multi-tenant loyalty platform
-- Every business record is tenant-scoped. Ledger is append-only.

create extension if not exists "pgcrypto";

-- ============ TENANTS ============
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  business_type text not null default 'restaurant',
  city text not null default 'Kitchener',
  status text not null default 'active' check (status in ('active','suspended')),
  plan text not null default 'launch',
  -- reward program (owner picks ONE mode)
  reward_mode text not null default 'visits' check (reward_mode in ('visits','points')),
  stamp_threshold int not null default 8,
  points_per_dollar numeric not null default 1,
  points_threshold int not null default 100,
  bonus_stamp_min_spend_cents int,
  reward_type text not null default 'free_item' check (reward_type in ('amount_off','free_item')),
  reward_amount_cents int,
  reward_label text not null default 'Free item',
  -- usage caps (plan limits)
  sms_limit int not null default 300,
  email_limit int not null default 5000,
  -- kill switches (platform admin only)
  marketing_paused boolean not null default false,
  sms_paused boolean not null default false,
  redemption_paused boolean not null default false,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Toronto',
  created_at timestamptz not null default now()
);

-- ============ USERS & ROLES ============
create table users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique, -- auth.users.id (Supabase Auth, bcrypt-hashed passwords)
  email text not null,
  name text not null,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade, -- null for platform_admin
  role text not null check (role in ('platform_admin','owner','manager','staff')),
  location_id uuid references locations(id),
  created_at timestamptz not null default now(),
  unique(user_id, tenant_id, role)
);

-- ============ CUSTOMERS ============
create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  email text,
  phone text not null,
  birthday date,
  referral_code text not null unique,
  referred_by uuid references customers(id),
  created_at timestamptz not null default now(),
  unique(tenant_id, phone)
);
create index customers_tenant_idx on customers(tenant_id);

create table customer_programs (
  customer_id uuid primary key references customers(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  stamps int not null default 0,
  points int not null default 0,
  lifetime_visits int not null default 0,
  lifetime_spend_cents int not null default 0,
  rewards_redeemed int not null default 0,
  updated_at timestamptz not null default now()
);

-- ============ LEDGER (append-only) ============
create table ledger_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  type text not null check (type in (
    'VISIT_AWARDED','POINTS_AWARDED','REFERRAL_BONUS','BIRTHDAY_BONUS',
    'AWARD_REVERSED','MANUAL_ADJUSTMENT',
    'REWARD_ISSUED','REWARD_REDEEMED','REWARD_EXPIRED','REWARD_VOIDED')),
  stamps_delta int not null default 0,
  points_delta int not null default 0,
  amount_cents int not null default 0,
  idempotency_key text not null unique,
  actor_user_id uuid references users(id),
  location_id uuid references locations(id),
  note text,
  created_at timestamptz not null default now()
);
create index ledger_customer_idx on ledger_events(customer_id, created_at desc);
create index ledger_tenant_idx on ledger_events(tenant_id, created_at desc);

create table rewards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  label text not null,
  reward_type text not null default 'free_item',
  amount_cents int,
  status text not null default 'issued' check (status in ('issued','redeemed','expired','voided')),
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  expires_at timestamptz
);
create index rewards_customer_idx on rewards(customer_id, status);

-- ============ CONSENT (CASL) ============
create table consent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null check (channel in ('sms','email')),
  status text not null check (status in ('opted_in','opted_out')),
  source text not null default 'enrollment',
  created_at timestamptz not null default now()
);
create index consent_customer_idx on consent_events(customer_id, channel, created_at desc);

-- ============ CAMPAIGNS & MESSAGES ============
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('sms','email')),
  audience text not null default 'all' check (audience in ('all','near_reward','lapsed_30','birthday_month')),
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft','sending','sent','cancelled')),
  created_by uuid references users(id),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null check (channel in ('sms','email')),
  status text not null default 'queued' check (status in ('queued','sent','failed','suppressed')),
  provider_message_id text,
  simulated boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index messages_campaign_idx on messages(campaign_id);

-- ============ USAGE & AUDIT ============
create table usage_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  month text not null,
  sms_used int not null default 0,
  email_used int not null default 0,
  primary key (tenant_id, month)
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  actor_user_id uuid references users(id),
  action text not null,
  target_type text,
  target_id text,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_tenant_idx on audit_events(tenant_id, created_at desc);

-- ============ RLS HELPERS ============
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from memberships m join users u on u.id = m.user_id
    where u.auth_id = auth.uid() and m.role = 'platform_admin'
  );
$$;

create or replace function public.tenant_member(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists(
    select 1 from memberships m join users u on u.id = m.user_id
    where u.auth_id = auth.uid() and m.tenant_id = tid
  );
$$;

create or replace function public.tenant_role(tid uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from memberships m join users u on u.id = m.user_id
  where u.auth_id = auth.uid() and (m.tenant_id = tid or m.role = 'platform_admin')
  order by case m.role
    when 'platform_admin' then 0 when 'owner' then 1
    when 'manager' then 2 else 3 end
  limit 1;
$$;

-- ============ RLS POLICIES ============
-- tenants
alter table tenants enable row level security;
create policy tenants_select on tenants for select using (public.tenant_member(id));
create policy tenants_admin_all on tenants for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy tenants_owner_update on tenants for update using (public.tenant_role(id) = 'owner') with check (public.tenant_role(id) = 'owner');

-- locations
alter table locations enable row level security;
create policy locations_rw on locations for all using (public.tenant_member(tenant_id)) with check (public.tenant_member(tenant_id));

-- users (people see themselves; owners/admins see their tenant's users)
alter table users enable row level security;
create policy users_self on users for select using (auth_id = auth.uid() or public.is_platform_admin());
create policy users_tenant on users for select using (
  exists(select 1 from memberships m join users u on u.id = m.user_id
    where u.auth_id = auth.uid() and m.role in ('owner','manager')
    and m.tenant_id in (select m2.tenant_id from memberships m2 where m2.user_id = users.id))
);

-- memberships
alter table memberships enable row level security;
create policy memberships_select on memberships for select using (
  public.is_platform_admin() or user_id = (select id from users where auth_id = auth.uid())
  or public.tenant_role(tenant_id) in ('owner','manager'));
create policy memberships_admin on memberships for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy memberships_owner on memberships for insert with check (public.tenant_role(tenant_id) = 'owner');
create policy memberships_owner_del on memberships for delete using (public.tenant_role(tenant_id) = 'owner');

-- customers
alter table customers enable row level security;
create policy customers_select on customers for select using (public.tenant_member(tenant_id));
create policy customers_insert on customers for insert with check (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager','staff'));
create policy customers_update on customers for update using (public.tenant_member(tenant_id)) with check (public.tenant_member(tenant_id));
create policy customers_delete on customers for delete using (public.tenant_role(tenant_id) in ('platform_admin','owner'));

-- customer_programs
alter table customer_programs enable row level security;
create policy cp_select on customer_programs for select using (public.tenant_member(tenant_id));
create policy cp_insert on customer_programs for insert with check (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager','staff'));
create policy cp_update on customer_programs for update using (public.tenant_member(tenant_id)) with check (public.tenant_member(tenant_id));

-- ledger_events (append-only: no updates/deletes for app roles)
alter table ledger_events enable row level security;
create policy ledger_select on ledger_events for select using (public.tenant_member(tenant_id));
create policy ledger_insert on ledger_events for insert with check (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager','staff'));

-- rewards
alter table rewards enable row level security;
create policy rewards_select on rewards for select using (public.tenant_member(tenant_id));
create policy rewards_insert on rewards for insert with check (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager','staff'));
create policy rewards_update on rewards for update using (public.tenant_member(tenant_id)) with check (public.tenant_member(tenant_id));

-- consent_events
alter table consent_events enable row level security;
create policy consent_select on consent_events for select using (public.tenant_member(tenant_id));
create policy consent_insert on consent_events for insert with check (public.tenant_member(tenant_id));

-- campaigns
alter table campaigns enable row level security;
create policy campaigns_select on campaigns for select using (public.tenant_member(tenant_id));
create policy campaigns_write on campaigns for all using (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager'))
  with check (public.tenant_role(tenant_id) in ('platform_admin','owner','manager'));

-- messages
alter table messages enable row level security;
create policy messages_select on messages for select using (public.tenant_member(tenant_id));
create policy messages_insert on messages for insert with check (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager'));

-- usage_counters
alter table usage_counters enable row level security;
create policy usage_select on usage_counters for select using (public.tenant_member(tenant_id));
create policy usage_admin on usage_counters for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- audit_events (append-only)
alter table audit_events enable row level security;
create policy audit_select on audit_events for select using (
  public.is_platform_admin() or (tenant_id is not null and public.tenant_role(tenant_id) in ('owner','manager')));
create policy audit_insert on audit_events for insert with check (true);
