-- Stamply migration 002 — always-on TRIGGER campaigns (per clarification)
-- Owner creates the rule once (message + channel + on/off); it fires per customer automatically.
-- Each trigger fires only once per customer per cycle (dedupe via trigger_fires).

create table trigger_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('near_reward','lapsed_30','birthday','reward_earned')),
  channel text not null check (channel in ('sms','email')),
  message_template text not null,
  enabled boolean not null default true,
  -- config: e.g. {"stamps_within": 1} for near_reward (fire when 1 stamp away)
  config jsonb not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, trigger_type, channel)
);

-- Dedupe: one fire per customer per cycle.
-- cycle_key examples: birthday -> '2026' (once per year),
--   near_reward -> reward cycle id, lapsed_30 -> '2026-09' month, reward_earned -> reward id.
create table trigger_fires (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  trigger_rule_id uuid not null references trigger_rules(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  cycle_key text not null,
  message_id uuid references messages(id),
  created_at timestamptz not null default now(),
  unique(trigger_rule_id, customer_id, cycle_key)
);
create index trigger_fires_customer_idx on trigger_fires(customer_id, created_at desc);

-- RLS
alter table trigger_rules enable row level security;
create policy trg_select on trigger_rules for select using (public.tenant_member(tenant_id));
create policy trg_write on trigger_rules for all using (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager'))
  with check (public.tenant_role(tenant_id) in ('platform_admin','owner','manager'));

alter table trigger_fires enable row level security;
create policy trgf_select on trigger_fires for select using (public.tenant_member(tenant_id));
create policy trgf_insert on trigger_fires for insert with check (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager'));
