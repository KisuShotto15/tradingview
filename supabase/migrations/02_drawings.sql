-- Migration 02: unified user_drawings table
-- Run this in your Supabase SQL Editor AFTER the initial schema.sql

create extension if not exists "pgcrypto";

create table if not exists public.user_drawings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  kind        text not null,
  data        jsonb not null default '{}',
  alert       jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists user_drawings_user_symbol_idx
  on public.user_drawings(user_id, symbol);

alter table public.user_drawings enable row level security;

drop policy if exists "Users can only access their own drawings" on public.user_drawings;
create policy "Users can only access their own drawings"
  on public.user_drawings for all
  using (auth.uid() = user_id);

-- Migrate existing horizontal price lines (if old table exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_price_lines'
  ) then
    insert into public.user_drawings (id, user_id, symbol, kind, data)
      select id, user_id, symbol, 'hline', jsonb_build_object('price', price)
      from public.user_price_lines
      on conflict (id) do nothing;

    drop table public.user_price_lines;
  end if;
end $$;
