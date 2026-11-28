-- Maklumat Tambahan acara: polisi tulis hanya merangkumi can_edit_usrah()/can_edit_program(), sedangkan
-- storage 'event-posters' dan usrah_events membenarkan juga admin kawasan usrah (can_edit_event_at).
-- Admin kawasan boleh memuat naik poster tambahan tetapi simpan baris maklumat gagal (RLS). Selaraskan.
create or replace function public.can_edit_event_id(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_edit_event_at(e.event_type, e.kawasan_usrah)
                     from public.usrah_events e where e.id = p_event_id), false);
$$;
revoke all on function public.can_edit_event_id(uuid) from public, anon;
grant execute on function public.can_edit_event_id(uuid) to authenticated;

drop policy if exists event_extra_info_insert on public.event_extra_info;
create policy event_extra_info_insert on public.event_extra_info
  for insert to authenticated with check (public.can_edit_event_id(event_id));
drop policy if exists event_extra_info_update on public.event_extra_info;
create policy event_extra_info_update on public.event_extra_info
  for update to authenticated using (public.can_edit_event_id(event_id)) with check (public.can_edit_event_id(event_id));
drop policy if exists event_extra_info_delete on public.event_extra_info;
create policy event_extra_info_delete on public.event_extra_info
  for delete to authenticated using (public.can_edit_event_id(event_id));
notify pgrst, 'reload schema';
