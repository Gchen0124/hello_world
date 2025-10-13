-- Create profiles table for user data
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamp with time zone default now()
);

-- Create timelines table to store user's timeline data
create table if not exists public.timelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  current_age integer not null check (current_age >= 0 and current_age <= 100),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create possibility_branches table for the 5 editable branches
create table if not exists public.possibility_branches (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  branch_index integer not null check (branch_index >= 0 and branch_index <= 4),
  branch_name text not null,
  created_at timestamp with time zone default now(),
  unique(timeline_id, branch_index)
);

-- Create events table for all timeline events (past and future)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  branch_index integer check (branch_index >= 0 and branch_index <= 4),
  year integer not null check (year >= 0 and year <= 100),
  event_text text not null,
  is_prediction boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.timelines enable row level security;
alter table public.possibility_branches enable row level security;
alter table public.events enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Timelines policies
create policy "Users can view own timelines"
  on public.timelines for select
  using (auth.uid() = user_id);

create policy "Users can insert own timelines"
  on public.timelines for insert
  with check (auth.uid() = user_id);

create policy "Users can update own timelines"
  on public.timelines for update
  using (auth.uid() = user_id);

create policy "Users can delete own timelines"
  on public.timelines for delete
  using (auth.uid() = user_id);

-- Possibility branches policies
create policy "Users can view own branches"
  on public.possibility_branches for select
  using (exists (
    select 1 from public.timelines
    where timelines.id = possibility_branches.timeline_id
    and timelines.user_id = auth.uid()
  ));

create policy "Users can insert own branches"
  on public.possibility_branches for insert
  with check (exists (
    select 1 from public.timelines
    where timelines.id = possibility_branches.timeline_id
    and timelines.user_id = auth.uid()
  ));

create policy "Users can update own branches"
  on public.possibility_branches for update
  using (exists (
    select 1 from public.timelines
    where timelines.id = possibility_branches.timeline_id
    and timelines.user_id = auth.uid()
  ));

create policy "Users can delete own branches"
  on public.possibility_branches for delete
  using (exists (
    select 1 from public.timelines
    where timelines.id = possibility_branches.timeline_id
    and timelines.user_id = auth.uid()
  ));

-- Events policies
create policy "Users can view own events"
  on public.events for select
  using (exists (
    select 1 from public.timelines
    where timelines.id = events.timeline_id
    and timelines.user_id = auth.uid()
  ));

create policy "Users can insert own events"
  on public.events for insert
  with check (exists (
    select 1 from public.timelines
    where timelines.id = events.timeline_id
    and timelines.user_id = auth.uid()
  ));

create policy "Users can update own events"
  on public.events for update
  using (exists (
    select 1 from public.timelines
    where timelines.id = events.timeline_id
    and timelines.user_id = auth.uid()
  ));

create policy "Users can delete own events"
  on public.events for delete
  using (exists (
    select 1 from public.timelines
    where timelines.id = events.timeline_id
    and timelines.user_id = auth.uid()
  ));

-- Create indexes for better performance
create index if not exists idx_timelines_user_id on public.timelines(user_id);
create index if not exists idx_branches_timeline_id on public.possibility_branches(timeline_id);
create index if not exists idx_events_timeline_id on public.events(timeline_id);
create index if not exists idx_events_branch_year on public.events(timeline_id, branch_index, year);
