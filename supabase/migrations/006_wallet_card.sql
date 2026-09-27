-- 006_wallet_card.sql — wallet card design B: tenant branding + reward verification codes
-- Apply via Supabase Management API or the dashboard SQL editor.

-- Tenant branding for the customer wallet card
alter table tenants add column if not exists logo_url text;
alter table tenants add column if not exists brand_color text not null default '#1e4d3b';
alter table tenants add column if not exists address text;
alter table tenants add column if not exists hours text;

-- Short human-readable single-use code per reward (e.g. BB-8X2Q).
-- Shown on the customer's card; staff verify it at redemption.
alter table rewards add column if not exists verification_code text;
create unique index if not exists rewards_verification_code_uidx on rewards(verification_code);

-- Backfill codes for already-issued rewards (2-letter business prefix + 4 unambiguous chars).
update rewards r
set verification_code = (
  select upper(left(regexp_replace(t.name, '[^A-Za-z]', '', 'g'), 2)) || '-' ||
         translate(upper(substring(md5(gen_random_uuid()::text) from 1 for 4)), '01', 'AB')
  from tenants t where t.id = r.tenant_id
)
where r.verification_code is null;

-- Public bucket for tenant logos (app uploads via service role; reads are public).
insert into storage.buckets (id, name, public)
values ('tenant-logos', 'tenant-logos', true)
on conflict (id) do nothing;
