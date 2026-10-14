create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', email text not null default '', phone text,
 role text not null default 'client' check (role in ('admin','client')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,full_name,email,phone,role)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.email,''),nullif(new.raw_user_meta_data->>'phone',''),'client')
 on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 description text, status text not null default 'active' check(status in ('active','archived')),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table if not exists public.project_members (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 assigned_at timestamptz not null default now(), primary key(project_id,user_id)
);
create table if not exists public.videos (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 storage_path text not null unique, title text not null check(length(trim(title)) between 1 and 160),
 description text, version_number integer not null check(version_number>0),
 mime_type text not null check(mime_type in ('video/mp4','video/webm','video/quicktime')),
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=524288000),
 uploaded_by uuid not null references public.profiles(id) on delete restrict,
 review_status text not null default 'in_review' check(review_status in ('draft','in_review','changes_requested','approved','archived')),
 created_at timestamptz not null default now(), unique(project_id,version_number)
);
create table if not exists public.comments (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 video_id uuid references public.videos(id) on delete set null,
 user_id uuid not null references public.profiles(id) on delete restrict,
 parent_comment_id uuid references public.comments(id) on delete cascade,
 body text not null check(length(trim(body)) between 1 and 5000),
 timestamp_seconds numeric(12,3) check(timestamp_seconds is null or timestamp_seconds>=0),
 resolved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.approvals (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 video_id uuid not null references public.videos(id) on delete cascade,
 approved_by uuid not null references public.profiles(id) on delete restrict,
 approved_at timestamptz not null default now(), version_number integer not null check(version_number>0)
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete cascade,
 project_id uuid references public.projects(id) on delete cascade,
 type text not null check(type in ('video_assigned','new_comment','comment_reply','changes_requested','new_version','approved')),
 payload jsonb not null default '{}'::jsonb, read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.audit_log (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
 project_id uuid references public.projects(id) on delete set null, action text not null, entity_type text not null,
 entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists videos_project_created_idx on public.videos(project_id,created_at desc);
create index if not exists comments_project_created_idx on public.comments(project_id,created_at desc);
create index if not exists comments_video_timestamp_idx on public.comments(video_id,timestamp_seconds);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id,created_at desc);
create index if not exists approvals_project_approved_idx on public.approvals(project_id,approved_at desc);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects for each row execute procedure public.set_updated_at();
drop trigger if exists comments_updated_at on public.comments;
create trigger comments_updated_at before update on public.comments for each row execute procedure public.set_updated_at();

-- Definer helpers prevent recursive RLS policies on memberships/profiles.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin');
$$;
create or replace function public.is_project_member(target_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.project_members pm where pm.project_id=target_project and pm.user_id=(select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
revoke all on function public.is_project_member(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.videos enable row level security;
alter table public.comments enable row level security;
alter table public.approvals enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

create policy "profile read self or admin" on public.profiles for select to authenticated using(id=(select auth.uid()) or (select public.is_admin()));
create policy "profile insert self as client" on public.profiles for insert to authenticated with check(id=(select auth.uid()) and role='client');
create policy "profile update self" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
revoke update on public.profiles from authenticated;
grant update(full_name,phone,updated_at) on public.profiles to authenticated;
grant insert on public.profiles to authenticated;

create policy "projects read authorized" on public.projects for select to authenticated using((select public.is_admin()) or (select public.is_project_member(id)));
create policy "projects admin insert" on public.projects for insert to authenticated with check((select public.is_admin()) and created_by=(select auth.uid()));
create policy "projects admin update" on public.projects for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy "projects admin delete" on public.projects for delete to authenticated using((select public.is_admin()));

create policy "members read authorized" on public.project_members for select to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));
create policy "members admin insert" on public.project_members for insert to authenticated with check((select public.is_admin()));
create policy "members admin update" on public.project_members for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy "members admin delete" on public.project_members for delete to authenticated using((select public.is_admin()));

create policy "videos read authorized" on public.videos for select to authenticated using((select public.is_admin()) or (select public.is_project_member(project_id)));
create policy "videos admin insert" on public.videos for insert to authenticated with check((select public.is_admin()) and uploaded_by=(select auth.uid()));
create policy "videos admin or client status update" on public.videos for update to authenticated
using((select public.is_admin()) or (select public.is_project_member(project_id)))
with check((select public.is_admin()) or ((select public.is_project_member(project_id)) and review_status in ('changes_requested','approved')));
create policy "videos admin delete" on public.videos for delete to authenticated using((select public.is_admin()));

create policy "comments read authorized" on public.comments for select to authenticated using((select public.is_admin()) or (select public.is_project_member(project_id)));
create policy "comments insert authorized" on public.comments for insert to authenticated with check(
 user_id=(select auth.uid()) and ((select public.is_admin()) or (select public.is_project_member(project_id))) and
 (parent_comment_id is null or exists(select 1 from public.comments parent where parent.id=comments.parent_comment_id and parent.project_id=comments.project_id))
);
create policy "comments update own or admin" on public.comments for update to authenticated using(user_id=(select auth.uid()) or (select public.is_admin())) with check(user_id=(select auth.uid()) or (select public.is_admin()));
create policy "comments admin delete" on public.comments for delete to authenticated using((select public.is_admin()));

create policy "approvals read authorized" on public.approvals for select to authenticated using((select public.is_admin()) or (select public.is_project_member(project_id)));
create policy "approvals insert authorized" on public.approvals for insert to authenticated with check(
 approved_by=(select auth.uid()) and ((select public.is_admin()) or (select public.is_project_member(project_id))) and
 exists(select 1 from public.videos v where v.id=approvals.video_id and v.project_id=approvals.project_id and v.version_number=approvals.version_number and v.review_status='approved')
);
create policy "approvals admin delete" on public.approvals for delete to authenticated using((select public.is_admin()));

create policy "notifications read recipient or admin" on public.notifications for select to authenticated using(recipient_id=(select auth.uid()) or (select public.is_admin()));
create policy "notifications update recipient" on public.notifications for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));
create policy "notifications admin insert" on public.notifications for insert to authenticated with check((select public.is_admin()));
create policy "notifications admin delete" on public.notifications for delete to authenticated using((select public.is_admin()));
create policy "audit admin read" on public.audit_log for select to authenticated using((select public.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('private-videos','private-videos',false,524288000,array['video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=524288000,allowed_mime_types=array['video/mp4','video/webm','video/quicktime'];

create policy "private videos read authorized" on storage.objects for select to authenticated using(
 bucket_id='private-videos' and case
 when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then (select public.is_admin()) or (select public.is_project_member(((storage.foldername(name))[1])::uuid))
 else false end
);
create policy "private videos admin upload" on storage.objects for insert to authenticated with check(
 bucket_id='private-videos' and (select public.is_admin()) and case
 when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then exists(select 1 from public.projects p where p.id=((storage.foldername(name))[1])::uuid and p.archived_at is null)
 else false end
);
create policy "private videos admin update" on storage.objects for update to authenticated using(bucket_id='private-videos' and (select public.is_admin())) with check(bucket_id='private-videos' and (select public.is_admin()));
create policy "private videos admin delete" on storage.objects for delete to authenticated using(bucket_id='private-videos' and (select public.is_admin()));

grant select on public.profiles,public.projects,public.project_members,public.videos,public.comments,public.approvals,public.notifications,public.audit_log to authenticated;
grant insert,update,delete on public.projects,public.project_members,public.comments,public.approvals,public.notifications to authenticated;
grant insert on public.videos to authenticated;
-- Clients may change review status only; they cannot rewrite a file path or version metadata.
revoke update on public.videos from authenticated;
grant update (review_status) on public.videos to authenticated;
grant delete on public.videos to authenticated;
