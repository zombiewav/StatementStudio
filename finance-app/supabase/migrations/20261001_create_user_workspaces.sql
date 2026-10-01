create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_workspaces enable row level security;

create policy "Users can read their own workspace"
  on public.user_workspaces for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own workspace"
  on public.user_workspaces for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own workspace"
  on public.user_workspaces for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
