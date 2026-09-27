-- 007: card-link resend (transactional, not marketing)
-- Rate-limit log for "lost your card link" requests.
create table if not exists card_link_resends (
  id uuid primary key default gen_random_uuid(),
  contact text not null,
  created_at timestamptz not null default now()
);
create index if not exists card_link_resends_contact_idx on card_link_resends(contact, created_at);

-- Mark messages as marketing vs transactional. Transactional sends
-- (card-link resends etc.) skip consent checks and usage limits.
alter table messages add column if not exists kind text not null default 'marketing';
