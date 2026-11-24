-- Privasi MBM (migration 174): HANYA panel yang dipilih melihat butiran permohonan.
-- Admin MBM / Super Admin hanya nampak BILANGAN (mbm_panel_list). Senarai penuh + tanda selesai admin dibuang.

drop function if exists public.mbm_admin_list();
drop function if exists public.mbm_admin_set_status(uuid, text);

create or replace function public.push_on_mbm_application()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dept uuid;
  v_member_user uuid;
  v_panel_user uuid;
begin
  select id into v_dept from public.departments where name = 'MAJLIS BAITUL MUSLIM';
  select m.user_id into v_member_user from public.members m where m.id = new.member_id;
  perform public.push_enqueue(array_remove(public.push_department_users(v_dept), v_member_user),
    'Permohonan Majlis Baitul Muslim', 'Ada permohonan MBM baharu.', '/(app)/admin/mbm-panel-urus');
  if new.panel_id is not null then
    select m.user_id into v_panel_user
      from public.mbm_panels p join public.members m on m.id = p.member_id
     where p.id = new.panel_id and p.aktif;
    perform public.push_enqueue(array[v_panel_user], 'Permohonan Majlis Baitul Muslim',
      'Ada permohonan MBM baharu untuk anda.', '/(app)/admin/mbm-panel');
  end if;
  return null;
end $$;

CREATE OR REPLACE FUNCTION public.admin_notifications_raw()
 RETURNS TABLE(kind text, title text, preview text, jumlah integer, terbaru timestamp with time zone, route text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_jumlah  integer;
  v_nama    text;
  v_bisnes  text;
  v_terbaru timestamptz;
  r         record;
begin
  -- 1. Iklan perniagaan menunggu semakan — LAJNAH EKONOMI DAN ASET (+ Super Admin).
  if public.can_view_business_ads_admin() then
    select count(*) into v_jumlah
    from public.member_business_ads a
    where a.status = 'menunggu';

    if v_jumlah > 0 then
      select m.full_name, a.nama_bisnes, a.submitted_at
        into v_nama, v_bisnes, v_terbaru
      from public.member_business_ads a
      join public.members m on m.id = a.member_id
      where a.status = 'menunggu'
      order by a.submitted_at desc, a.id
      limit 1;

      kind := 'iklan_menunggu';
      title := 'Iklan bisnes menunggu semakan';
      preview := v_nama || ' menghantar iklan "' || v_bisnes || '"'
                 || case when v_jumlah > 1 then ' dan ' || (v_jumlah - 1) || ' lagi' else '' end
                 || '.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/semakan-iklan';
      return next;
    end if;
  end if;

  -- 2. Permintaan padam akaun — Super Admin sahaja (sama dengan list_account_deletion_requests()).
  if public.is_super_admin() then
    select count(*), max(r2.created_at) into v_jumlah, v_terbaru
    from public.account_deletion_requests r2
    where r2.status = 'pending';

    if v_jumlah > 0 then
      select m.full_name into v_nama
      from public.account_deletion_requests r2
      join public.members m on m.id = r2.member_id
      where r2.status = 'pending'
      order by r2.created_at desc
      limit 1;

      kind := 'padam_akaun';
      title := 'Permintaan padam akaun';
      preview := v_nama || ' memohon padam akaun'
                 || case when v_jumlah > 1 then ' dan ' || (v_jumlah - 1) || ' lagi' else '' end
                 || '.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/permintaan-padam-akaun';
      return next;
    end if;
  end if;

  -- 3. Permohonan bantuan menunggu semakan — TABUNG ZAKAT (+ Super Admin).
  if public.can_view_bantuan_admin() then
    select count(*), max(a.dihantar_at) into v_jumlah, v_terbaru
    from public.bantuan_applications a
    where a.status = 'submitted'
      and a.member_id is distinct from public.my_member_id();

    if v_jumlah > 0 then
      kind := 'bantuan_menunggu';
      title := 'Permohonan bantuan menunggu semakan';
      preview := v_jumlah || ' permohonan bantuan menunggu semakan.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/bantuan';
      return next;
    end if;
  end if;

  -- 4. Maklum balas ahli (chat) belum dibaca — SATU baris setiap department yang
  --    pemanggil boleh lihat (Super Admin: semua). Sembang sendiri dikecualikan.
  --    Hilang bila perbualan dibuka (admin_read_at).
  for r in
    select d.id as dept_id, d.name as dept_name, count(*)::integer as jml, max(t.last_message_at) as terbaru
    from public.feedback_threads t
    join public.departments d on d.id = t.department_id
    where t.last_sender = 'ahli'
      and (t.admin_read_at is null or t.admin_read_at < t.last_message_at)
      and t.member_id is distinct from public.my_member_id()
      and public.has_department_access(d.name, false)
    group by d.id, d.name
    order by max(t.last_message_at) desc
  loop
    kind := 'maklum_balas_chat:' || r.dept_id::text;
    title := 'Maklum balas ahli — ' || public.feedback_department_label(r.dept_name);
    preview := r.jml || ' perbualan belum dibaca.';
    jumlah := r.jml;
    terbaru := r.terbaru;
    route := '/(app)/admin/maklum-balas-chat?dept=' || r.dept_id::text;
    return next;
  end loop;

  -- 5. Sesi kaunseling belum dibaca — hanya KAUNSELOR aktif, hanya perbualan sendiri.
  --    Tiada nama ahli dalam notifikasi.
  v_jumlah := coalesce(public.counseling_counselor_unread(), 0);
  if v_jumlah > 0 then
    select max(t.last_message_at) into v_terbaru
    from public.counseling_threads t where t.counselor_id = public.my_counselor_id();
    kind := 'kaunseling';
    title := 'Sesi kaunseling baharu';
    preview := v_jumlah || ' perbualan kaunseling belum dibaca.';
    jumlah := v_jumlah;
    terbaru := v_terbaru;
    route := '/(app)/admin/kaunseling-peti';
    return next;
  end if;

  -- 6. Permohonan MBM baharu — MAJLIS BAITUL MUSLIM (+ Super Admin). Tiada nama dalam notifikasi.
  if public.can_view_mbm_admin() then
    select count(*), max(a.created_at) into v_jumlah, v_terbaru
    from public.mbm_applications a
    where a.status = 'baharu'
      and a.member_id is distinct from public.my_member_id();

    if v_jumlah > 0 then
      kind := 'mbm_permohonan';
      title := 'Permohonan Majlis Baitul Muslim';
      preview := v_jumlah || ' permohonan MBM baharu.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/mbm-panel-urus';
      return next;
    end if;
  end if;

  -- 7. Permohonan MBM untuk panel yang dipilih sahaja. Tiada nama dalam notifikasi.
  if public.is_active_mbm_panel() then
    select count(*), max(a.created_at) into v_jumlah, v_terbaru
    from public.mbm_applications a
    where a.status = 'baharu'
      and a.panel_id = public.my_mbm_panel_id()
      and a.member_id is distinct from public.my_member_id();

    if v_jumlah > 0 then
      kind := 'mbm_panel';
      title := 'Permohonan Majlis Baitul Muslim';
      preview := v_jumlah || ' permohonan MBM baharu untuk anda.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/mbm-panel';
      return next;
    end if;
  end if;

  return;
end;
$function$;

revoke all on function public.admin_notifications_raw() from public, anon, authenticated;
