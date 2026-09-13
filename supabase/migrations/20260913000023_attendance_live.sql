-- =============================================================================
-- mysaf-off — Paparan kehadiran masa nyata (admin)
--
-- Jalankan SELEPAS 20260913000022_poster_with_qr.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Skrin admin melanggan Supabase Realtime pada `usrah_attendance_scans` dan
-- membaca semula senarai hadir setiap kali baris baharu masuk.
--
-- Realtime hanya digunakan sebagai ISYARAT, bukan sumber data. Mesej perubahan
-- membawa baris imbasan sahaja (member_id, masa), dan admin JABATAN SETIAUSAHA
-- tidak boleh membaca `members` untuk menukar id itu kepada nama. Fungsi di
-- bawah yang memulangkan nama dan avatar — dengan semakan kebenaran yang sama
-- seperti laporan program sedia ada.
-- =============================================================================


-- =============================================================================
-- 1. TERBITKAN usrah_attendance_scans KEPADA REALTIME
--
-- Realtime menghormati RLS: pelanggan hanya menerima perubahan pada baris yang
-- policy `usrah_scans_select` benarkan dia baca, iaitu admin yang boleh melihat
-- jenis acara itu (atau ahli itu sendiri, bagi barisnya sendiri).
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'usrah_attendance_scans'
     ) then
    alter publication supabase_realtime add table public.usrah_attendance_scans;
  end if;
end;
$$;


-- =============================================================================
-- 2. SENARAI HADIR SATU ACARA
--
-- Terkini di atas. Kebenaran mengikut jenis acara (`can_view_event`), jadi admin
-- LAJNAH TARBIAH melihat usrah dan admin JABATAN SETIAUSAHA melihat program —
-- sama seperti skrin butiran acara. Acara yang tidak boleh dilihat memulangkan
-- set kosong, bukan ralat, supaya kewujudannya tidak disahkan.
-- =============================================================================

create or replace function public.event_attendance_live(p_event_id uuid)
returns table (
  scan_id    uuid,
  full_name  text,
  generasi   text,
  avatar_url text,
  scanned_at timestamptz,
  method     text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    m.full_name,
    m.generasi,
    m.avatar_url,
    s.scanned_at,
    s.method
  from public.usrah_attendance_scans s
  join public.usrah_events e on e.id = s.event_id
  join public.members m on m.id = s.member_id
  where s.event_id = p_event_id
    and public.can_view_event(e.event_type)
  order by s.scanned_at desc;
$$;

revoke all on function public.event_attendance_live(uuid) from public, anon;
grant execute on function public.event_attendance_live(uuid) to authenticated;

notify pgrst, 'reload schema';
