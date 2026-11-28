-- =============================================================================
-- "Betulkan kehadiran usrah" (admin) hanya menulis grid bulanan
-- (usrah_monthly_attendance). Rekod kehadiran acara (Kehadiran Live, Excel kehadiran
-- acara) membaca usrah_attendance_scans, jadi pembetulan nampak "berjaya" tetapi
-- jadual rekod kehadiran tidak berubah.
--
-- Kini pembetulan bulanan juga menyegerakkan scan acara usrah bulan + kawasan itu:
--   Hadir + kawasan  -> scan 'manual' pada acara usrah kawasan itu (tarikh sama, jika tidak
--                       acara terawal bulan itu); scan acara usrah bulan itu yang lain dibuang.
--   Tidak hadir / kosongkan / tiada kawasan -> semua scan acara usrah bulan itu dibuang.
-- Isi semula: pembetulan admin sedia ada yang belum ada scan.
-- =============================================================================

create or replace function public.usrah_sync_scan(
  p_member_id uuid, p_year int, p_month int, p_attended boolean, p_kawasan text, p_date date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_event uuid;
begin
  if p_attended and p_kawasan is not null then
    select e.id into v_event
      from public.usrah_events e
     where e.event_type = 'usrah' and e.kawasan_usrah = p_kawasan
       and e.year = p_year and e.month = p_month and e.archived_at is null
     order by (e.start_date = p_date) desc nulls last, e.start_date
     limit 1;
  end if;

  -- Buang scan acara usrah bulan itu yang bukan sasaran.
  delete from public.usrah_attendance_scans s
   using public.usrah_events e
   where s.event_id = e.id and s.member_id = p_member_id
     and e.event_type = 'usrah' and e.year = p_year and e.month = p_month
     and (v_event is null or e.id <> v_event);

  if v_event is not null then
    insert into public.usrah_attendance_scans (event_id, member_id, method, attendance_mode)
    values (v_event, p_member_id, 'manual', 'bersemuka')
    on conflict (event_id, member_id) do nothing;
  end if;
end $$;
revoke all on function public.usrah_sync_scan(uuid, int, int, boolean, text, date) from public, anon, authenticated;

create or replace function public.admin_set_usrah_attendance(
  p_member_id uuid, p_year int, p_month int, p_attended boolean,
  p_kawasan_attended text, p_location_text text, p_attended_date date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_kawasan  text := nullif(upper(trim(coalesce(p_kawasan_attended, ''))), '');
  v_location text := nullif(trim(coalesce(p_location_text, '')), '');
  v_date     date := p_attended_date;
  v_name     text;
begin
  if not coalesce(public.can_edit_usrah(), false) then
    raise exception 'Merekod kehadiran usrah memerlukan kebenaran menyunting pada LAJNAH TARBIAH.' using errcode = 'MS001';
  end if;
  if p_attended is null then
    raise exception 'Status kehadiran wajib dipilih.' using errcode = '22023';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Tahun atau bulan tidak sah.' using errcode = '22023';
  end if;
  if v_kawasan is not null and v_kawasan not in ('US', 'ULK', 'UU', 'UPT', 'UT', 'UTS', 'UA-UB', 'UP') then
    raise exception 'Kod kawasan tidak sah.' using errcode = '22023';
  end if;
  select full_name into v_name from public.members where id = p_member_id;
  if not found then
    raise exception 'Ahli tidak dijumpai.' using errcode = 'P0002';
  end if;
  if not p_attended then
    v_kawasan := null; v_location := null; v_date := null;
  end if;

  insert into public.usrah_monthly_attendance as t (
    member_id, year, month, attended, attendance_source,
    kawasan_attended, location_text, attended_date, recorded_by
  ) values (p_member_id, p_year, p_month, p_attended, 'usrah', v_kawasan, v_location, v_date, 'admin')
  on conflict (member_id, year, month) do update
    set attended = excluded.attended, kawasan_attended = excluded.kawasan_attended,
        location_text = excluded.location_text, attended_date = excluded.attended_date,
        recorded_by = 'admin', updated_at = now();

  perform public.usrah_sync_scan(p_member_id, p_year, p_month, p_attended, v_kawasan, v_date);

  perform public.log_admin_activity(
    'Kemas kini kehadiran usrah', 'usrah_monthly_attendance', p_member_id::text,
    jsonb_build_object('label', coalesce(v_name, 'Ahli') || ' · ' || lpad(p_month::text, 2, '0') || '/' || p_year,
      'hadir', p_attended, 'kawasan', v_kawasan, 'lokasi', v_location, 'tarikh', v_date),
    auth.uid());
end $$;
revoke all on function public.admin_set_usrah_attendance(uuid, int, int, boolean, text, text, date) from public, anon;
grant execute on function public.admin_set_usrah_attendance(uuid, int, int, boolean, text, text, date) to authenticated;

create or replace function public.admin_clear_usrah_attendance(p_member_id uuid, p_year int, p_month int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_existed boolean;
begin
  if not coalesce(public.can_edit_usrah(), false) then
    raise exception 'Membetulkan kehadiran usrah memerlukan kebenaran menyunting pada LAJNAH TARBIAH.' using errcode = 'MS001';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Tahun atau bulan tidak sah.' using errcode = '22023';
  end if;
  select full_name into v_name from public.members where id = p_member_id;
  if not found then
    raise exception 'Ahli tidak dijumpai.' using errcode = 'P0002';
  end if;

  delete from public.usrah_monthly_attendance where member_id = p_member_id and year = p_year and month = p_month;
  v_existed := found;
  perform public.usrah_sync_scan(p_member_id, p_year, p_month, false, null, null);

  if v_existed then
    perform public.log_admin_activity('Kosongkan status kehadiran usrah', 'usrah_monthly_attendance', p_member_id::text,
      jsonb_build_object('label', coalesce(v_name, 'Ahli') || ' · ' || lpad(p_month::text, 2, '0') || '/' || p_year), auth.uid());
  end if;
end $$;
revoke all on function public.admin_clear_usrah_attendance(uuid, int, int) from public, anon;
grant execute on function public.admin_clear_usrah_attendance(uuid, int, int) to authenticated;

-- Isi semula: pembetulan admin sedia ada (hadir + kawasan) yang belum ada scan.
insert into public.usrah_attendance_scans (event_id, member_id, method, attendance_mode)
select distinct on (m.member_id, m.year, m.month) e.id, m.member_id, 'manual', 'bersemuka'
  from public.usrah_monthly_attendance m
  join public.usrah_events e
    on e.event_type = 'usrah' and e.kawasan_usrah = m.kawasan_attended
   and e.year = m.year and e.month = m.month and e.archived_at is null
 where m.recorded_by = 'admin' and m.attended and m.kawasan_attended is not null
   and not exists (select 1 from public.usrah_attendance_scans s
                    join public.usrah_events e2 on e2.id = s.event_id
                   where s.member_id = m.member_id and e2.event_type = 'usrah' and e2.year = m.year and e2.month = m.month)
 order by m.member_id, m.year, m.month, (e.start_date = m.attended_date) desc nulls last, e.start_date
on conflict (event_id, member_id) do nothing;

notify pgrst, 'reload schema';
