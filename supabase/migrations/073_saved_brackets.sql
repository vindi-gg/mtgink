-- 073_saved_brackets.sql
-- Persistent storage for completed brackets belonging to logged-in users.
-- Anonymous users still save completed brackets to localStorage client-side;
-- the two paths are chosen in BracketFillView based on auth state.

create table if not exists saved_brackets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brew_slug text,
  brew_name text,
  card_count int not null check (card_count >= 2),
  champion_oracle_id uuid not null,
  champion_illustration_id uuid not null,
  champion_name text not null,
  champion_artist text not null,
  champion_set_code text not null,
  champion_collector_number text not null,
  champion_image_version text,
  champion_slug text not null,
  completed_at timestamptz not null default now()
);

-- Primary access pattern is "list this user's saved brackets, newest first".
create index if not exists idx_saved_brackets_user_completed
  on saved_brackets(user_id, completed_at desc);

-- Secondary: "how many times has this user beaten this brew?"
create index if not exists idx_saved_brackets_user_brew
  on saved_brackets(user_id, brew_slug)
  where brew_slug is not null;

alter table saved_brackets enable row level security;

-- Users can read their own saved brackets.
drop policy if exists "Users can read own saved brackets" on saved_brackets;
create policy "Users can read own saved brackets"
  on saved_brackets for select
  using (auth.uid() = user_id);

-- Users can insert rows only under their own user_id. RLS + WITH CHECK
-- means a client can't spoof another user's user_id.
drop policy if exists "Users can insert own saved brackets" on saved_brackets;
create policy "Users can insert own saved brackets"
  on saved_brackets for insert
  with check (auth.uid() = user_id);

-- Users can delete their own saved brackets (for a future "remove from
-- history" UI).
drop policy if exists "Users can delete own saved brackets" on saved_brackets;
create policy "Users can delete own saved brackets"
  on saved_brackets for delete
  using (auth.uid() = user_id);
