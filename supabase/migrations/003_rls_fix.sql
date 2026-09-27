-- Migration 003: fix potential RLS recursion on users table.
-- The users_tenant policy queried the users table from inside a policy on users.
-- Replace with a SECURITY DEFINER helper that bypasses RLS.

create or replace function public.my_tenant_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select m.tenant_id
  from memberships m
  join users u on u.id = m.user_id
  where u.auth_id = auth.uid()
    and m.tenant_id is not null;
$$;

drop policy if exists users_tenant on users;
create policy users_tenant on users for select using (
  id in (select m.user_id from memberships m where m.tenant_id in (select public.my_tenant_ids()))
  or auth.uid() = auth_id
);
