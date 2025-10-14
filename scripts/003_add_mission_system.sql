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
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table public.life_missions enable row level security;
alter table public.success_metrics enable row level security;
alter table public.mission_steps enable row level security;

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

-- Create indexes for better performance
create index if not exists idx_missions_timeline_branch on public.life_missions(timeline_id, branch_index);
create index if not exists idx_metrics_mission on public.success_metrics(mission_id);
create index if not exists idx_steps_mission on public.mission_steps(mission_id);
create index if not exists idx_steps_parent on public.mission_steps(parent_step_id);
