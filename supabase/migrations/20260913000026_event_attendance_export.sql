-- =============================================================================
-- MySAFF — Eksport kehadiran SATU acara (usrah DAN program)
--
-- Jalankan SELEPAS 20260913000025_event_qr_for_members.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Umum daripada `program_event_attendance()` (program sahaja). Kebenaran ikut
-- jenis acara melalui `can_view_event()` → `event_department()`: LAJNAH
-- TARBIAH untuk usrah, JABATAN SETIAUSAHA untuk program.
--
-- `security definer` atas sebab yang sama: admin department itu belum tentu
-- boleh membaca `members`, jadi laluan biasa memulangkan kehadiran tanpa nama.
-- Tiga kolum pengenalan sahaja didedahkan.
--
-- `program_event_attendance()` dikekalkan untuk app versi lama.
-- =============================================================================

create or replace function public.event_attendance_export(p_event_id uuid)
returns table (
  nombor_ahli text,
  full_name   text,
  generasi    text,
  scanned_at  timestamptz,
  method      text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
    s.scanned_at,
    s.method
  from public.usrah_attendance_scans s
  join public.members m on m.id = s.member_id
  join public.usrah_events e on e.id = s.event_id
  where s.event_id = p_event_id
    and public.can_view_event(e.event_type)
  order by s.scanned_at;
$$;

revoke all on function public.event_attendance_export(uuid) from public, anon;
grant execute on function public.event_attendance_export(uuid) to authenticated;

notify pgrst, 'reload schema';
