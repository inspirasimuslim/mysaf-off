-- =============================================================================
-- MySAFF — Padam atau arkib acara (usrah DAN program)
--
-- Jalankan SELEPAS 20260913000027_event_rsvp.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Acara yang sudah mempunyai sejarah (imbasan kehadiran atau RSVP) TIDAK boleh
-- dipadam terus: kedua-dua table itu `on delete cascade`, jadi DELETE akan
-- menyapu sejarahnya bersama. Acara begitu diarkibkan — `is_active = false`
-- (hilang dari direktori ahli, sama seperti nonaktif biasa) DAN `archived_at`
-- ditetapkan, supaya senarai admin boleh membezakan "diarkib" daripada
-- "dimatikan sementara".
--
-- Keputusan padam-atau-arkib dibuat dalam SATU fungsi pelayan dan bukan di app:
-- kiraan dan tindakan berlaku dalam transaksi yang sama, dengan baris acara
-- dikunci, jadi imbasan atau RSVP yang masuk di pertengahan tidak boleh
-- tercicir oleh DELETE.
-- =============================================================================


-- 1. KOLUM ---------------------------------------------------------------------

alter table public.usrah_events
  add column if not exists archived_at timestamptz;


-- 2. AKTIF SEMULA MEMBATALKAN ARKIB ---------------------------------------------
--
-- Admin yang menghidupkan semula acara arkib dari skrin butiran jelas mahu ia
-- kembali ke senarai utama. Tanpa ini ia akan aktif tetapi terus tersorok.

create or replace function public.clear_event_archive_on_activate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_active and not old.is_active then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_event_archive_on_activate() from public, anon;

drop trigger if exists usrah_events_clear_archive on public.usrah_events;
create trigger usrah_events_clear_archive
  before update of is_active on public.usrah_events
  for each row execute function public.clear_event_archive_on_activate();


-- 3. PADAM ATAU ARKIB -----------------------------------------------------------
--
-- `security definer` supaya kiraan melihat SEMUA baris imbasan/RSVP tanpa
-- bergantung pada RLS pembaca; kebenaran disemak secara eksplisit dengan
-- `can_edit_event()` — pemetaan department yang sama dengan policy DELETE.
--
-- `for update` pada acara bertembung dengan `for share` dalam
-- `record_usrah_attendance()` dan kunci kunci-asing INSERT `event_rsvp`, jadi
-- kiraan di bawah tidak boleh basi sebelum DELETE berjalan.

create or replace function public.delete_or_archive_event(p_event_id uuid)
returns table (outcome text, attendance_count integer, rsvp_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type  text;
  v_scans integer;
  v_rsvps integer;
begin
  select e.event_type into v_type
  from public.usrah_events e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
  end if;

  if not public.can_edit_event(v_type) then
    raise exception 'Anda tiada kebenaran memadam program ini.' using errcode = '42501';
  end if;

  select count(*)::integer into v_scans from public.usrah_attendance_scans s where s.event_id = p_event_id;
  select count(*)::integer into v_rsvps from public.event_rsvp r where r.event_id = p_event_id;

  if v_scans > 0 or v_rsvps > 0 then
    update public.usrah_events e
    set is_active = false,
        archived_at = coalesce(e.archived_at, now())
    where e.id = p_event_id;

    return query select 'archived'::text, v_scans, v_rsvps;
  else
    delete from public.usrah_events e where e.id = p_event_id;

    return query select 'deleted'::text, 0, 0;
  end if;
end;
$$;

revoke all on function public.delete_or_archive_event(uuid) from public, anon;
grant execute on function public.delete_or_archive_event(uuid) to authenticated;

notify pgrst, 'reload schema';
