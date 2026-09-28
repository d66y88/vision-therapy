-- 视力小训练营 · Supabase schema for anonymous, sync-code based multi-device sync.
-- Run once in the Supabase SQL editor. Enable "Anonymous sign-ins" in
-- Authentication → Providers first.
--
-- Model: each install signs in anonymously. A "family" groups devices; a
-- device joins another device's family by redeeming a short sync code.
-- All data (sessions, kv config) is isolated per family via RLS. No child PII.

-- Extensions ------------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()

-- Tables ----------------------------------------------------------------------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists public.sync_codes (
  code text primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.sessions (
  id uuid primary key, -- client-generated syncId
  family_id uuid not null references public.families (id) on delete cascade,
  device_id text,
  module text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_ms integer not null default 0,
  accuracy real not null default 0,
  avg_reaction_ms real,
  score integer not null default 0,
  clinical jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists sessions_family_updated_idx
  on public.sessions (family_id, updated_at);

create table if not exists public.kv (
  family_id uuid not null references public.families (id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (family_id, key)
);

-- Membership helper (avoids RLS recursion in policies) ------------------------
create or replace function public.is_family_member(f uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = f and m.user_id = auth.uid()
  );
$$;

-- Row Level Security ----------------------------------------------------------
alter table public.families        enable row level security;
alter table public.family_members  enable row level security;
alter table public.sync_codes      enable row level security;
alter table public.sessions        enable row level security;
alter table public.kv              enable row level security;

-- family_members: a user sees only their own memberships.
drop policy if exists fm_select_own on public.family_members;
create policy fm_select_own on public.family_members
  for select using (user_id = auth.uid());

-- families: members can read their family row.
drop policy if exists fam_select_member on public.families;
create policy fam_select_member on public.families
  for select using (public.is_family_member(id));

-- sessions: full CRUD limited to the caller's family.
drop policy if exists sessions_rw on public.sessions;
create policy sessions_rw on public.sessions
  for all
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- kv: same family isolation.
drop policy if exists kv_rw on public.kv;
create policy kv_rw on public.kv
  for all
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- sync_codes: no direct table access; handled via RPC only.

-- RPCs (SECURITY DEFINER — vetted writes) -------------------------------------

-- Create a family for the caller (idempotent-ish: returns existing if any).
create or replace function public.create_family()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select family_id into fid
  from public.family_members
  where user_id = auth.uid()
  limit 1;

  if fid is not null then
    return fid;
  end if;

  insert into public.families default values returning id into fid;
  insert into public.family_members (family_id, user_id) values (fid, auth.uid());
  return fid;
end;
$$;

-- Generate a short sync code for the caller's family (valid 24h).
create or replace function public.create_sync_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
  new_code text;
begin
  select family_id into fid
  from public.family_members
  where user_id = auth.uid()
  limit 1;

  if fid is null then
    raise exception 'no family';
  end if;

  -- 6-char uppercase code (avoid ambiguous chars handled client-side too).
  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.sync_codes (code, family_id, expires_at)
  values (new_code, fid, now() + interval '24 hours');
  return new_code;
end;
$$;

-- Redeem a sync code: join that family. Returns the family id.
create or replace function public.redeem_sync_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select family_id into fid
  from public.sync_codes
  where code = upper(p_code) and expires_at > now()
  limit 1;

  if fid is null then
    raise exception 'invalid or expired code';
  end if;

  insert into public.family_members (family_id, user_id)
  values (fid, auth.uid())
  on conflict do nothing;

  return fid;
end;
$$;

grant execute on function public.create_family() to anon, authenticated;
grant execute on function public.create_sync_code() to anon, authenticated;
grant execute on function public.redeem_sync_code(text) to anon, authenticated;
