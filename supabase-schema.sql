-- ══════════════════════════════════════════════════════════
-- The Sleep Collective Hub — Supabase Database Schema
-- Run this entire script in:
--   Supabase Dashboard → SQL Editor → New query → Run
-- ══════════════════════════════════════════════════════════

-- 1. SETTINGS (one row per user)
create table if not exists settings (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users(id) on delete cascade not null unique,
  super_rate       numeric  default 12,
  fee_rate         numeric  default 30,
  provider_details text     default '',
  bank_details     text     default '',
  billed_to        text     default '',
  last_backup_date timestamptz,
  created_at       timestamptz default now()
);

-- 2. SERVICES
create table if not exists services (
  id         text primary key default gen_random_uuid()::text,
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text    not null,
  price      numeric not null,
  fee_pct    numeric,
  created_at timestamptz default now()
);

-- 3. SERVICE RECORDS
create table if not exists records (
  id             text primary key default gen_random_uuid()::text,
  user_id        uuid references auth.users(id) on delete cascade not null,
  date           text    not null,
  client         text    not null,
  child_name     text    default '',
  child_age      text    default '',
  service_id     text,
  price          numeric,
  fee_pct        numeric,
  discount_code  text    default '',
  invoiced       boolean default false,
  invoice_date   timestamptz,
  created_at     timestamptz default now()
);

-- 4. INVOICES
create table if not exists invoices (
  id               text primary key,
  user_id          uuid references auth.users(id) on delete cascade not null,
  date             timestamptz not null,
  date_str         text,
  billing_period   text,
  provider_details text,
  bank_details     text,
  billed_to        text,
  table_data       jsonb default '[]',
  summary          jsonb default '{}',
  record_ids       jsonb default '[]',
  created_at       timestamptz default now()
);

-- ══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — each user sees only their own data
-- ══════════════════════════════════════════════════════════

alter table settings enable row level security;
alter table services enable row level security;
alter table records  enable row level security;
alter table invoices enable row level security;

-- Settings
drop policy if exists "Own settings" on settings;
create policy "Own settings" on settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Services
drop policy if exists "Own services" on services;
create policy "Own services" on services
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Records
drop policy if exists "Own records" on records;
create policy "Own records" on records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Invoices
drop policy if exists "Own invoices" on invoices;
create policy "Own invoices" on invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
