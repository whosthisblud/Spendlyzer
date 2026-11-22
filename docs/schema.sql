-- Spendlyzer schema for Supabase (PostgreSQL).
-- Run in the Supabase SQL editor. Mirrors backend/app/models and adds Row Level Security
-- so user-owned rows are isolated even when accessed directly with the anon key.
-- The FastAPI backend also scopes every query by user id.

create extension if not exists "pgcrypto";

create table if not exists public.users (
    id uuid primary key references auth.users (id) on delete cascade,
    email varchar(320),
    default_currency varchar(3) not null default 'INR',
    created_at timestamptz not null default now()
);

create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    name varchar(50) not null,
    type varchar(10) not null check (type in ('income', 'expense')),
    created_at timestamptz not null default now(),
    constraint uq_category_user_name_type unique (user_id, name, type)
);
create index if not exists ix_categories_user_id on public.categories (user_id);

create table if not exists public.transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    category_id uuid references public.categories (id) on delete set null,
    amount numeric(14, 2) not null constraint ck_transaction_amount_positive check (amount > 0),
    currency varchar(3) not null default 'INR',
    description varchar(255) not null,
    date date not null,
    type varchar(10) not null check (type in ('income', 'expense')),
    payment_method varchar(30),
    category_source varchar(10) not null default 'manual'
        check (category_source in ('manual', 'imported', 'ml', 'rules')),
    fingerprint varchar(64) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists ix_transactions_user_id on public.transactions (user_id);
create index if not exists ix_transactions_user_date on public.transactions (user_id, date);
create index if not exists ix_transactions_user_fingerprint on public.transactions (user_id, fingerprint);

create table if not exists public.budgets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    category_id uuid references public.categories (id) on delete cascade,
    monthly_limit numeric(14, 2) not null constraint ck_budget_limit_positive check (monthly_limit > 0),
    currency varchar(3) not null default 'INR',
    period date not null check (extract(day from period) = 1),
    created_at timestamptz not null default now(),
    constraint uq_budget_user_category_period unique (user_id, category_id, period)
);
create index if not exists ix_budgets_user_id on public.budgets (user_id);
-- NULL category_id = overall budget; enforce one per month (unique above treats NULLs as distinct).
create unique index if not exists uq_budget_overall_period on public.budgets (user_id, period) where category_id is null;

create table if not exists public.ml_predictions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    transaction_id uuid references public.transactions (id) on delete cascade,
    prediction_type varchar(20) not null check (prediction_type in ('category', 'anomaly', 'forecast')),
    result jsonb not null,
    score double precision,
    model_version varchar(50),
    created_at timestamptz not null default now()
);
create index if not exists ix_ml_predictions_user_id on public.ml_predictions (user_id);
create index if not exists ix_ml_predictions_transaction_id on public.ml_predictions (transaction_id);

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;
drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at before update on public.transactions
    for each row execute function public.set_updated_at();

-- Row Level Security: every user-owned table is visible only to its owner.
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.ml_predictions enable row level security;

drop policy if exists users_own on public.users;
create policy users_own on public.users
    for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
    foreach t in array array['categories', 'transactions', 'budgets', 'ml_predictions'] loop
        execute format('drop policy if exists %1$s_own on public.%1$s', t);
        execute format(
            'create policy %1$s_own on public.%1$s for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
            t);
    end loop;
end $$;
