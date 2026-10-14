-- Make client approvals atomic and prevent direct status escalation through table updates.
drop policy if exists "videos admin or client status update" on public.videos;
create policy "videos admin or client status update" on public.videos for update to authenticated
using (
  (select public.is_admin()) or
  ((select public.is_project_member(project_id)) and review_status in ('in_review','changes_requested'))
)
with check (
  (select public.is_admin()) or
  ((select public.is_project_member(project_id)) and review_status = 'changes_requested')
);

create or replace function public.approve_video(target_video uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_row public.videos%rowtype;
declare actor uuid;
begin
  actor := auth.uid();
  if actor is null then raise exception 'Autenticación requerida'; end if;

  select * into target_row
  from public.videos v
  where v.id = target_video
  for update;

  if not found then raise exception 'Video no disponible'; end if;
  if not public.is_admin() and not public.is_project_member(target_row.project_id) then
    raise exception 'No tienes permiso para aprobar esta entrega';
  end if;
  if target_row.review_status not in ('in_review','changes_requested') then
    raise exception 'Esta versión no está disponible para aprobación';
  end if;

  update public.videos set review_status = 'approved' where id = target_row.id;
  insert into public.approvals(project_id,video_id,approved_by,version_number)
  values(target_row.project_id,target_row.id,actor,target_row.version_number);
end;
$$;

revoke all on function public.approve_video(uuid) from public;
revoke insert on public.approvals from authenticated;
grant execute on function public.approve_video(uuid) to authenticated;
