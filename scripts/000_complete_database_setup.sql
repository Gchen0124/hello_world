-- Complete Database Setup for Lifetime Timeline App
-- Run this script to set up the entire database from scratch

-- ============================================
-- STEP 1: Create Core Tables
-- ============================================

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
  is_user_edited boolean default false,
  last_edited_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- ============================================
-- STEP 2: Create Mission System Tables
-- ============================================

-- Create life_missions table for ultimate life mission at end of each branch
create table if not exists public.life_missions (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  branch_index integer not null check (branch_index >= 0 and branch_index <= 4),
  mission_text text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(timeline_id, branch_index)
);

-- Create success_metrics table for key success metrics
create table if not exists public.success_metrics (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.life_missions(id) on delete cascade,
  metric_text text not null,
  display_order integer not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create mission_steps table for AI-generated and user-edited steps
create table if not exists public.mission_steps (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.life_missions(id) on delete cascade,
  parent_step_id uuid references public.mission_steps(id) on delete cascade,
  step_text text not null,
  display_order integer not null default 0,
  is_ai_generated boolean default false,
  is_user_edited boolean default false,
  last_edited_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- ============================================
-- STEP 3: Enable Row Level Security
-- ============================================

alter table public.profiles enable row level security;
alter table public.timelines enable row level security;
alter table public.possibility_branches enable row level security;
alter table public.events enable row level security;
alter table public.life_missions enable row level security;
alter table public.success_metrics enable row level security;
alter table public.mission_steps enable row level security;

-- ============================================
-- STEP 4: Drop Existing Policies (if any)
-- ============================================

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Users can view own timelines" on public.timelines;
drop policy if exists "Users can insert own timelines" on public.timelines;
drop policy if exists "Users can update own timelines" on public.timelines;
drop policy if exists "Users can delete own timelines" on public.timelines;

drop policy if exists "Users can view own branches" on public.possibility_branches;
drop policy if exists "Users can insert own branches" on public.possibility_branches;
drop policy if exists "Users can update own branches" on public.possibility_branches;
drop policy if exists "Users can delete own branches" on public.possibility_branches;

drop policy if exists "Users can view own events" on public.events;
drop policy if exists "Users can insert own events" on public.events;
drop policy if exists "Users can update own events" on public.events;
drop policy if exists "Users can delete own events" on public.events;

drop policy if exists "Users can view own missions" on public.life_missions;
drop policy if exists "Users can insert own missions" on public.life_missions;
drop policy if exists "Users can update own missions" on public.life_missions;
drop policy if exists "Users can delete own missions" on public.life_missions;

drop policy if exists "Users can view own metrics" on public.success_metrics;
drop policy if exists "Users can insert own metrics" on public.success_metrics;
drop policy if exists "Users can update own metrics" on public.success_metrics;
drop policy if exists "Users can delete own metrics" on public.success_metrics;

drop policy if exists "Users can view own steps" on public.mission_steps;
drop policy if exists "Users can insert own steps" on public.mission_steps;
drop policy if exists "Users can update own steps" on public.mission_steps;
drop policy if exists "Users can delete own steps" on public.mission_steps;

-- ============================================
-- STEP 5: Create RLS Policies
-- ============================================

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

-- Life missions policies
create policy "Users can view own missions"
  on public.life_missions for select
  using (exists (
    select 1 from public.timelines
    where timelines.id = life_missions.timeline_id
    and timelines.user_id = auth.uid()
  ));

create policy "Users can insert own missions"
  on public.life_missions for insert
  with check (exists (
    select 1 from public.timelines
    where timelines.id = life_missions.timeline_id
    and timelines.user_id = auth.uid()
  ));

create policy "Users can update own missions"
  on public.life_missions for update
  using (exists (
    select 1 from public.timelines
    where timelines.id = life_missions.timeline_id
    and timelines.user_id = auth.uid()
  ));

create policy "Users can delete own missions"
  on public.life_missions for delete
  using (exists (
    select 1 from public.timelines
    where timelines.id = life_missions.timeline_id
    and timelines.user_id = auth.uid()
  ));

-- Success metrics policies
create policy "Users can view own metrics"
  on public.success_metrics for select
  using (exists (
    select 1 from public.life_missions lm
    join public.timelines t on t.id = lm.timeline_id
    where lm.id = success_metrics.mission_id
    and t.user_id = auth.uid()
  ));

create policy "Users can insert own metrics"
  on public.success_metrics for insert
  with check (exists (
    select 1 from public.life_missions lm
    join public.timelines t on t.id = lm.timeline_id
    where lm.id = success_metrics.mission_id
    and t.user_id = auth.uid()
  ));

create policy "Users can update own metrics"
  on public.success_metrics for update
  using (exists (
    select 1 from public.life_missions lm
    join public.timelines t on t.id = lm.timeline_id
    where lm.id = success_metrics.mission_id
    and t.user_id = auth.uid()
  ));

create policy "Users can delete own metrics"
  on public.success_metrics for delete
  using (exists (
    select 1 from public.life_missions lm
    join public.timelines t on t.id = lm.timeline_id
    where lm.id = success_metrics.mission_id
    and t.user_id = auth.uid()
  ));

-- Mission steps policies
create policy "Users can view own steps"
  on public.mission_steps for select
  using (exists (
    select 1 from public.life_missions lm
    join public.timelines t on t.id = lm.timeline_id
    where lm.id = mission_steps.mission_id
    and t.user_id = auth.uid()
  ));

create policy "Users can insert own steps"
  on public.mission_steps for insert
  with check (exists (
    select 1 from public.life_missions lm
    join public.timelines t on t.id = lm.timeline_id
    where lm.id = mission_steps.mission_id
    and t.user_id = auth.uid()
  ));

create policy "Users can update own steps"
  on public.mission_steps for update
  using (exists (
    select 1 from public.life_missions lm
    join public.timelines t on t.id = lm.timeline_id
    where lm.id = mission_steps.mission_id
    and t.user_id = auth.uid()
  ));

create policy "Users can delete own steps"
  on public.mission_steps for delete
  using (exists (
    select 1 from public.life_missions lm
    join public.timelines t on t.id = lm.timeline_id
    where lm.id = mission_steps.mission_id
    and t.user_id = auth.uid()
  ));

-- ============================================
-- STEP 6: Create Indexes
-- ============================================

create index if not exists idx_timelines_user_id on public.timelines(user_id);
create index if not exists idx_branches_timeline_id on public.possibility_branches(timeline_id);
create index if not exists idx_events_timeline_id on public.events(timeline_id);
create index if not exists idx_events_branch_year on public.events(timeline_id, branch_index, year);
create index if not exists idx_events_user_edited on public.events(timeline_id, branch_index, is_user_edited);
create index if not exists idx_missions_timeline_branch on public.life_missions(timeline_id, branch_index);
create index if not exists idx_metrics_mission on public.success_metrics(mission_id);
create index if not exists idx_steps_mission on public.mission_steps(mission_id);
create index if not exists idx_steps_parent on public.mission_steps(parent_step_id);
create index if not exists idx_steps_user_edited on public.mission_steps(mission_id, is_user_edited);

-- ============================================
-- STEP 7: Create Trigger Function
-- ============================================

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (
    new.id,
    new.email
  )
  on conflict (id) do nothing;
  
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================
-- STEP 8: Add Comments
-- ============================================

comment on column public.events.is_user_edited is 'Marks events that have been manually edited by user - AI should not modify these';
comment on column public.mission_steps.is_user_edited is 'Marks steps that have been manually edited by user - AI should not modify these';
