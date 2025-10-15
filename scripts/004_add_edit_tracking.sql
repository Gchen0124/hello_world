-- Add columns to track user edits vs AI-generated content
alter table public.events
add column if not exists is_user_edited boolean default false,
add column if not exists last_edited_at timestamp with time zone;

alter table public.mission_steps
add column if not exists is_user_edited boolean default false,
add column if not exists last_edited_at timestamp with time zone;

-- Create index for better query performance
create index if not exists idx_events_user_edited on public.events(timeline_id, branch_index, is_user_edited);
create index if not exists idx_steps_user_edited on public.mission_steps(mission_id, is_user_edited);

-- Add comment for clarity
comment on column public.events.is_user_edited is 'Marks events that have been manually edited by user - AI should not modify these';
comment on column public.mission_steps.is_user_edited is 'Marks steps that have been manually edited by user - AI should not modify these';
