-- Reset RSVP: ahli menekan jawapan yang sama sekali lagi -> kembali "belum respon".
-- Tiada DELETE pada event_rsvp (027), jadi melalui RPC yang hanya memadam baris SENDIRI
-- dan hanya semasa RSVP masih dibuka.
create or replace function public.clear_my_event_rsvp(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.event_rsvp_open(p_event_id) then
    raise exception 'RSVP sudah ditutup untuk acara ini.';
  end if;

  delete from public.event_rsvp
  where event_id = p_event_id
    and member_id = public.my_member_id();
end;
$$;

revoke all on function public.clear_my_event_rsvp(uuid) from public, anon;
grant execute on function public.clear_my_event_rsvp(uuid) to authenticated;

notify pgrst, 'reload schema';
