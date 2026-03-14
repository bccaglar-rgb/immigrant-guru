-- PostgreSQL schema for production deployment
-- TRON USDT (TRC20) only, extensible for multi-chain

create table if not exists app_users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('USER','ADMIN')),
  two_factor_enabled boolean not null default false,
  two_factor_secret_enc jsonb,
  password_reset_token_hash text,
  password_reset_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_sessions (
  token text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists plans (
  id uuid primary key,
  name text not null,
  price_usdt numeric(18,6) not null check (price_usdt > 0),
  duration_days integer not null check (duration_days > 0),
  features jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  plan_id uuid not null references plans(id),
  expected_amount_usdt numeric(18,6) not null,
  paid_amount_usdt numeric(18,6) not null default 0,
  deposit_address text not null,
  address_index bigint not null,
  status text not null check (status in ('created','awaiting_payment','partially_paid','paid','expired','failed')),
  chain text not null default 'TRON',
  token text not null default 'USDT_TRC20',
  expires_at timestamptz not null,
  paid_at timestamptz,
  payment_tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deposit_address)
);

create table if not exists payment_events (
  id uuid primary key,
  invoice_id uuid not null references invoices(id) on delete cascade,
  tx_hash text not null,
  log_index integer not null default 0,
  from_address text not null,
  to_address text not null,
  amount_usdt numeric(18,6) not null,
  contract_address text not null,
  confirmations integer not null,
  block_number bigint not null,
  success boolean not null,
  processed_at timestamptz not null default now(),
  unique (tx_hash, log_index, invoice_id)
);

create table if not exists subscriptions (
  id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  plan_id uuid not null references plans(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in ('active','expired','cancelled')),
  payment_tx_hash text not null,
  paid_amount_usdt numeric(18,6) not null,
  paid_at timestamptz not null,
  plan_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id bigserial primary key,
  user_id text,
  action text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoices_user_status on invoices(user_id, status);
create index if not exists idx_invoices_expires on invoices(expires_at);
create index if not exists idx_payment_events_tx on payment_events(tx_hash);
create index if not exists idx_subscriptions_user on subscriptions(user_id, status, end_at);
