-- Idempotent remainder of migration 002
create table if not exists trigger_fires (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  trigger_rule_id uuid not null references trigger_rules(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  cycle_key text not null,
  message_id uuid references messages(id),
  created_at timestamptz not null default now(),
  unique(trigger_rule_id, customer_id, cycle_key)
);
create index if not exists trigger_fires_customer_idx on trigger_fires(customer_id, created_at desc);

alter table trigger_rules enable row level security;
alter table trigger_fires enable row level security;

drop policy if exists trg_select on trigger_rules;
create policy trg_select on trigger_rules for select using (public.tenant_member(tenant_id));
drop policy if exists trg_write on trigger_rules;
create policy trg_write on trigger_rules for all using (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager'))
  with check (public.tenant_role(tenant_id) in ('platform_admin','owner','manager'));

drop policy if exists trgf_select on trigger_fires;
create policy trgf_select on trigger_fires for select using (public.tenant_member(tenant_id));
drop policy if exists trgf_insert on trigger_fires;
create policy trgf_insert on trigger_fires for insert with check (
  public.tenant_role(tenant_id) in ('platform_admin','owner','manager'));
