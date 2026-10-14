-- Additional workflow notifications and tighter comment update privileges.
revoke update on public.comments from authenticated;
grant update (body, resolved_at, updated_at) on public.comments to authenticated;

create or replace function public.notify_project_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(recipient_id,project_id,type,payload)
  select new.user_id,new.project_id,'video_assigned',
    jsonb_build_object('project_name',p.name)
  from public.projects p where p.id=new.project_id;
  return new;
end; $$;

create or replace function public.notify_new_video()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(recipient_id,project_id,type,payload)
  select recipients.id,new.project_id,'new_version',
    jsonb_build_object('video_id',new.id,'title',new.title,'version_number',new.version_number)
  from (
    select pm.user_id as id from public.project_members pm where pm.project_id=new.project_id
    union
    select p.id from public.profiles p where p.role='admin'
  ) recipients
  where recipients.id <> new.uploaded_by;
  return new;
end; $$;

create or replace function public.notify_new_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare notification_type text;
begin
  notification_type := case when new.parent_comment_id is null then 'new_comment' else 'comment_reply' end;
  insert into public.notifications(recipient_id,project_id,type,payload)
  select recipients.id,new.project_id,notification_type,
    jsonb_build_object('comment_id',new.id,'body_preview',left(new.body,160),'timestamp_seconds',new.timestamp_seconds)
  from (
    select pm.user_id as id from public.project_members pm where pm.project_id=new.project_id
    union
    select p.id from public.profiles p where p.role='admin'
  ) recipients
  where recipients.id <> new.user_id;
  return new;
end; $$;

create or replace function public.notify_video_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare notification_type text;
declare actor_id uuid;
begin
  if new.review_status is not distinct from old.review_status then return new; end if;
  actor_id := auth.uid();
  if new.review_status = 'changes_requested' then
    notification_type := 'changes_requested';
    insert into public.notifications(recipient_id,project_id,type,payload)
    select p.id,new.project_id,notification_type,jsonb_build_object('video_id',new.id,'title',new.title,'version_number',new.version_number)
    from public.profiles p where p.role='admin' and p.id is distinct from actor_id;
  elsif new.review_status = 'approved' then
    notification_type := 'approved';
    insert into public.notifications(recipient_id,project_id,type,payload)
    select recipients.id,new.project_id,notification_type,jsonb_build_object('video_id',new.id,'title',new.title,'version_number',new.version_number)
    from (
      select pm.user_id as id from public.project_members pm where pm.project_id=new.project_id
      union
      select p.id from public.profiles p where p.role='admin'
    ) recipients
    where recipients.id is distinct from actor_id;
  end if;
  return new;
end; $$;

drop trigger if exists project_assignment_notification on public.project_members;
create trigger project_assignment_notification after insert on public.project_members
for each row execute procedure public.notify_project_assignment();
drop trigger if exists new_video_notification on public.videos;
create trigger new_video_notification after insert on public.videos
for each row execute procedure public.notify_new_video();
drop trigger if exists new_comment_notification on public.comments;
create trigger new_comment_notification after insert on public.comments
for each row execute procedure public.notify_new_comment();
drop trigger if exists video_status_notification on public.videos;
create trigger video_status_notification after update of review_status on public.videos
for each row execute procedure public.notify_video_status();

-- Keep the profile email in sync with Supabase Auth without making it client-editable.
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email,'') where id = new.id;
  return new;
end; $$;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute procedure public.handle_user_email_change();
