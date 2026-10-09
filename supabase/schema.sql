-- Anyara Hills — Supabase schema
--
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- It is safe to re-run; every object is created with "if not exists" or "or replace".
--
-- Security model
--   • Everyone who reads pricing must be signed in. The anon key ships inside the
--     iPad app and the repo is public, so anonymous read would publish the price list.
--   • Only an 'admin' profile may insert, update or delete lots.
--   • Advisors get a profile with role 'advisor': read-only.

-- ---------------------------------------------------------------- profiles --

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'advisor' check (role in ('admin', 'advisor')),
  must_change_password boolean not null default true,
  created_at  timestamptz not null default now()
);

-- for projects created before this column existed
alter table public.profiles
  add column if not exists must_change_password boolean not null default true;

comment on table public.profiles is
  'One row per auth user. role drives every policy below.';

-- Create the profile automatically whenever a user is added in Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role check used by the policies. security definer so it can read profiles
-- without the caller needing its own select policy (avoids recursive RLS).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- -------------------------------------------------------------------- lots --

create table if not exists public.lots (
  id             uuid primary key default gen_random_uuid(),
  lot_no         text not null unique,
  phase          text,
  category       text,
  land_size_sf   numeric(12,2) not null check (land_size_sf > 0),
  list_price     numeric(14,2) not null check (list_price >= 0),
  privilege      numeric(14,2) not null default 0 check (privilege >= 0),
  status         text not null default 'Available'
                 check (status in ('Available', 'Reserved', 'Booked', 'Sold')),
  notes          text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null,

  -- derived, so the app and the admin console can never disagree on the maths
  nett_price numeric(14,2)
    generated always as (list_price - privilege) stored,
  psf numeric(12,2)
    generated always as (round((list_price - privilege) / land_size_sf, 2)) stored,

  constraint privilege_not_above_list check (privilege <= list_price)
);

-- for projects created before this column existed
alter table public.lots add column if not exists category text;

create index if not exists lots_status_idx on public.lots (status);
create index if not exists lots_lot_no_idx  on public.lots (lot_no);

create or replace function public.touch_lot()
returns trigger
language plpgsql
security invoker
set search_path = public          -- pinned: an unset search_path is a lint failure
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists lots_touch on public.lots;
create trigger lots_touch
  before insert or update on public.lots
  for each row execute function public.touch_lot();

-- ----------------------------------------------------------- import audit --

create table if not exists public.price_imports (
  id            uuid primary key default gen_random_uuid(),
  filename      text,
  row_count     integer not null default 0,
  inserted      integer not null default 0,
  updated       integer not null default 0,
  skipped       integer not null default 0,
  imported_by   uuid references auth.users (id) on delete set null,
  imported_at   timestamptz not null default now(),
  note          text
);

-- --------------------------------------------------------------- policies --

alter table public.profiles      enable row level security;
alter table public.lots          enable row level security;
alter table public.price_imports enable row level security;

-- profiles: you can read your own row; admins can read everyone's.
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- You may clear your own first-login flag after changing your password, but you
-- cannot promote yourself: the role must stay exactly what it already is.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- lots: any signed-in user reads; only admins write.
drop policy if exists lots_select_authenticated on public.lots;
create policy lots_select_authenticated on public.lots
  for select to authenticated
  using (true);

drop policy if exists lots_admin_write on public.lots;
create policy lots_admin_write on public.lots
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- imports: admins only, both ways.
drop policy if exists imports_admin on public.price_imports;
create policy imports_admin on public.price_imports
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------- function grants --
--
-- Both helpers live in the `public` schema, so PostgREST exposes them at
-- /rest/v1/rpc/... unless EXECUTE is revoked.

-- A trigger function has no business being callable over the API. The owner
-- keeps EXECUTE, so the auth.users trigger still fires.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- is_admin() must stay callable by `authenticated`: the RLS policies evaluate
-- it as the querying role, so revoking it there would break every write policy.
-- It only reports whether the caller themselves is an admin, which that caller
-- already knows. Anonymous visitors have no reason to call it.
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------------ setup --
--
-- 1. Authentication → Users → "Add user" → create yourself with a password.
--    (Turn OFF public sign-ups: Authentication → Sign In / Providers →
--     uncheck "Allow new users to sign up". Advisors are created by you.)
--
-- 2. Promote yourself to admin — replace the address with your own:
--
--      update public.profiles set role = 'admin'
--      where email = 'you@khkland.com';
--
-- 3. Add each advisor the same way (Add user → they stay role 'advisor').
--
-- To revoke someone, delete them under Authentication → Users. Their profile
-- row goes with them, and they can no longer read pricing on any device.
