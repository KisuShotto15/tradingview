-- Schema para TradingView Gratis
-- Corré esto en el SQL Editor de tu proyecto Supabase

-- Habilitar extensión para UUIDs
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- user_profiles: datos extra del usuario
-- ─────────────────────────────────────────────
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz default now()
);

alter table public.user_profiles enable row level security;

create policy "Usuarios solo ven su perfil"
  on public.user_profiles for all
  using (auth.uid() = id);

-- Función para crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────
-- user_watchlists: lista de símbolos por usuario
-- ─────────────────────────────────────────────
create table if not exists public.user_watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbols    text[] not null default '{}',
  updated_at timestamptz default now()
);

create unique index if not exists user_watchlists_user_id_idx on public.user_watchlists(user_id);

alter table public.user_watchlists enable row level security;

create policy "Usuarios solo ven su watchlist"
  on public.user_watchlists for all
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- user_chart_settings: configuración del chart por usuario
-- ─────────────────────────────────────────────
create table if not exists public.user_chart_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null default 'BTCUSDT',
  timeframe   text not null default '15m',
  indicators  jsonb not null default '{}',
  hidden      jsonb not null default '{}',
  config      jsonb not null default '{}',
  updated_at  timestamptz default now()
);

create unique index if not exists user_chart_settings_user_id_idx on public.user_chart_settings(user_id);

alter table public.user_chart_settings enable row level security;

create policy "Usuarios solo ven su configuración"
  on public.user_chart_settings for all
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- user_price_lines: líneas horizontales de precio
-- ─────────────────────────────────────────────
create table if not exists public.user_price_lines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  price      double precision not null,
  created_at timestamptz default now()
);

create index if not exists user_price_lines_user_symbol_idx on public.user_price_lines(user_id, symbol);

alter table public.user_price_lines enable row level security;

create policy "Usuarios solo ven sus price lines"
  on public.user_price_lines for all
  using (auth.uid() = user_id);
