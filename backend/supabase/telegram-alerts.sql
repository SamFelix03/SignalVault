-- Telegram vault alert subscriptions (UI-managed, not on-chain)
create table if not exists public.telegram_subscriptions (
  id            bigserial primary key,
  chat_id       text not null,
  vault_address text not null,
  username      text,
  subscribed_at timestamptz not null default now(),
  unique (chat_id, vault_address)
);

create index if not exists idx_telegram_subscriptions_vault
  on public.telegram_subscriptions (vault_address);

create index if not exists idx_telegram_subscriptions_chat
  on public.telegram_subscriptions (chat_id);

-- Dedup: one notification per vault + signal identity (survives backend restarts)
create table if not exists public.telegram_sent_signals (
  id              bigserial primary key,
  vault_address   text not null,
  reasoning_hash  text not null,
  signal_hash     text,
  sent_at         timestamptz not null default now(),
  unique (vault_address, reasoning_hash)
);

create index if not exists idx_telegram_sent_signals_vault
  on public.telegram_sent_signals (vault_address);

-- RLS: backend uses service role (bypasses RLS). No direct client access in v1.
alter table public.telegram_subscriptions enable row level security;
alter table public.telegram_sent_signals enable row level security;

create policy "no_public_access_subscriptions"
  on public.telegram_subscriptions for all
  using (false) with check (false);

create policy "no_public_access_sent_signals"
  on public.telegram_sent_signals for all
  using (false) with check (false);

-- Short-lived tokens for "Open in Telegram" deep-link connect (no manual user ID)
create table if not exists public.telegram_link_tokens (
  token         text primary key,
  vault_address text not null,
  chat_id       text,
  username      text,
  first_name    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  completed_at  timestamptz
);

create index if not exists idx_telegram_link_tokens_expires
  on public.telegram_link_tokens (expires_at);

alter table public.telegram_link_tokens enable row level security;

create policy "no_public_access_link_tokens"
  on public.telegram_link_tokens for all
  using (false) with check (false);
