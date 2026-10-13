-- =============================================================================
-- mysaf-off — Kehadiran manual ikut acara (usrah / program) oleh admin
--
-- Jalankan SELEPAS 20261013000154_infaq_tabung_zakat.sql. Idempotent.
--
-- MASALAH: "Betulkan kehadiran usrah" (admin_set_usrah_attendance) hanya menulis
-- grid bulanan (usrah_monthly_attendance). Excel kehadiran acara
-- (event_attendance_export) dan senarai langsung membaca usrah_attendance_scans,
-- jadi kehadiran yang dibetulkan manual tidak muncul di situ.
--
-- PENYELESAIAN: admin memilih acara yang pernah dicipta dan menanda ahli hadir
-- (bersemuka / online). Ia menulis usrah_attendance_scans (method 'manual') DAN
-- grid bulanan dengan logik yang sama seperti attendance_core(). Kebenaran =
-- can_edit_event_at(jenis, kawasan) (Tarbiah/Program sunting + admin kawasan).
-- Tiada data sedia ada diubah.
-- =============================================================================

alter table public.usrah_attendance_scans drop constraint if exists usrah_attendance_scans_method_check;
alter table public.usrah_attendance_scans
  add constraint usrah_attendance_scans_method_check check (method in ('scan', 'upload', 'proximity', 'manual'));


-- 1. SENARAI ACARA + STATUS AHLI ------------------------------------------------

create or replace function public.admin_events_for_attendance(p_member_id uuid)
returns table (
  event_id        uuid,
  name            text,
  event_type      text,
  start_date      date,
  kawasan_usrah   text,
  hadir           boolean,
  attendance_mode text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.name, e.event_type, e.start_date, e.kawasan_usrah,
         (s.id is not null), s.attendance_mode
  from public.usrah_events e
  left join public.usrah_attendance_scans s
         on s.event_id = e.id and s.member_id = p_member_id
  where e.archived_at is null
    and public.can_edit_event_at(e.event_type, e.kawasan_usrah)
  order by e.start_date desc, e.name
  limit 300;
$$;

revoke all on function public.admin_events_for_attendance(uuid) from public, anon;
grant execute on function public.admin_events_for_attendance(uuid) to authenticated;


-- 2. TANDA / BUANG KEHADIRAN ----------------------------------------------------

create or replace function public.admin_set_event_attendance(
  p_member_id uuid,
  p_event_id  uuid,
  p_hadir     boolean,
  p_mode      text default 'bersemuka'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.usrah_events%rowtype;
  v_name  text;
  v_mode  text := lower(coalesce(p_mode, 'bersemuka'));
begin
  select * into v_event from public.usrah_events where id = p_event_id;
  if not found then
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
  end if;

  if not coalesce(public.can_edit_event_at(v_event.event_type, v_event.kawasan_usrah), false) then
    raise exception 'Merekod kehadiran program ini memerlukan kebenaran menyunting.' using errcode = 'MS001';
  end if;

  if p_hadir is null then
    raise exception 'Status kehadiran wajib dipilih.' using errcode = '22023';
  end if;
  if v_mode not in ('bersemuka', 'online') then
    raise exception 'Mod kehadiran tidak sah.' using errcode = '22023';
  end if;

  select full_name into v_name from public.members where id = p_member_id;
  if not found then
    raise exception 'Ahli tidak dijumpai.' using errcode = 'P0002';
  end if;

  if p_hadir then
    insert into public.usrah_attendance_scans (event_id, member_id, method, attendance_mode)
    values (p_event_id, p_member_id, 'manual', v_mode)
    on conflict (event_id, member_id) do update set attendance_mode = excluded.attendance_mode;

    -- Grid bulanan: usrah SENTIASA; program hanya bila ganti_usrah (sama seperti attendance_core).
    if v_event.event_type = 'usrah' or v_event.ganti_usrah then
      insert into public.usrah_monthly_attendance as t (
        member_id, year, month, attended, attendance_source,
        kawasan_attended, location_text, attended_date, recorded_by
      )
      values (
        p_member_id,
        case when v_event.event_type = 'usrah'
             then coalesce(v_event.year, extract(year from v_event.start_date)::int)
             else v_event.ganti_usrah_year end,
        case when v_event.event_type = 'usrah'
             then coalesce(v_event.month, extract(month from v_event.start_date)::int)
             else v_event.ganti_usrah_month end,
        true,
        case when v_event.event_type = 'usrah' then 'usrah' else 'program_ganti' end,
        v_event.kawasan_usrah,
        v_event.location_text,
        v_event.start_date,
        'admin'
      )
      on conflict (member_id, year, month) do update
        set attended          = true,
            attendance_source = case when t.attended is distinct from true
                                     then excluded.attendance_source else t.attendance_source end,
            kawasan_attended  = coalesce(t.kawasan_attended, excluded.kawasan_attended),
            location_text     = coalesce(t.location_text, excluded.location_text),
            attended_date     = coalesce(t.attended_date, excluded.attended_date),
            recorded_by       = 'admin',
            updated_at        = now();
    end if;
  else
    -- Membuang kehadiran acara SAHAJA. Grid bulanan tidak disentuh (bulan itu mungkin
    -- dihadiri melalui acara lain); gunakan "Betulkan kehadiran" bulanan untuk itu.
    delete from public.usrah_attendance_scans where event_id = p_event_id and member_id = p_member_id;
  end if;

  perform public.log_admin_activity(
    case when p_hadir then 'Tanda kehadiran acara' else 'Buang kehadiran acara' end,
    'usrah_attendance_scans',
    p_member_id::text,
    jsonb_build_object('label', coalesce(v_name, 'Ahli') || ' · ' || v_event.name,
                       'acara', v_event.name, 'mod', case when p_hadir then v_mode else null end),
    auth.uid()
  );
end;
$$;

revoke all on function public.admin_set_event_attendance(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_event_attendance(uuid, uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
