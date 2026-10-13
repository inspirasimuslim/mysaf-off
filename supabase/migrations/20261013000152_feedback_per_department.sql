-- =============================================================================
-- mysaf-off — Maklum Balas ikut DEPARTMENT (peti masuk berasingan) — 2026-10-13
--
-- Susulan migration 151: semua perbualan tidak lagi dikumpul dalam SATU peti
-- masuk. Setiap seksyen department di Hub Admin ada butang Maklum Balas sendiri
-- (hanya perbualan department itu), dan notifikasi dipecahkan ikut department.
--
--   * `feedback_admin_threads(p_department)` — tapis ikut department (null = semua
--     yang boleh dilihat). Tandatangan lama tanpa argumen digugurkan (elak kabur).
--   * `feedback_admin_unread_by_dept()` — department yang pemanggil boleh lihat +
--     bilangan perbualan belum dibaca (lencana butang + paparan seksyen Hub).
--   * `feedback_department_label()` — nama paparan ringkas untuk tajuk notifikasi.
--   * `admin_notifications()` — blok ke-4 ditulis semula: SATU baris setiap
--     department yang ada perbualan belum dibaca (salinan tepat 151 selainnya).
-- Hanya fungsi; tiada data disentuh, tiada snapshot diperlukan.
-- =============================================================================

drop function if exists public.feedback_admin_threads();

create or replace function public.feedback_admin_threads(p_department uuid default null)
returns table (id uuid, member_name text, generasi text, department_name text,
               last_message_at timestamptz, last_sender text, last_body text, unread boolean)
language sql stable security definer set search_path = public
as $$
  select t.id, m.full_name, m.generasi, d.name, t.last_message_at, t.last_sender,
         (select x.body from public.feedback_messages x where x.thread_id = t.id order by x.created_at desc limit 1),
         (t.last_sender = 'ahli' and (t.admin_read_at is null or t.admin_read_at < t.last_message_at))
  from public.feedback_threads t
  join public.departments d on d.id = t.department_id
  join public.members m on m.id = t.member_id
  where public.feedback_can_admin(t.department_id)
    and (p_department is null or t.department_id = p_department)
    and t.member_id is distinct from public.my_member_id()
  order by (t.last_sender = 'ahli' and (t.admin_read_at is null or t.admin_read_at < t.last_message_at)) desc,
           t.last_message_at desc
  limit 200;
$$;

create or replace function public.feedback_admin_unread_by_dept()
returns table (department_id uuid, department_name text, unread integer)
language sql stable security definer set search_path = public
as $$
  select d.id, d.name,
         (select count(*)::integer from public.feedback_threads t
           where t.department_id = d.id
             and t.last_sender = 'ahli'
             and (t.admin_read_at is null or t.admin_read_at < t.last_message_at)
             and t.member_id is distinct from public.my_member_id())
  from public.departments d
  where d.is_active and public.has_department_access(d.name, false)
  order by d.name;
$$;

create or replace function public.feedback_department_label(p_name text)
returns text
language sql immutable
as $$
  select case p_name
    when 'SETIAUSAHA' then 'Setiausaha Agung (SUA)'
    when 'TIMBALAN SETIAUSAHA' then 'Timbalan Setiausaha (TSUA)'
    when 'JABATAN SETIAUSAHA' then 'Jabatan Setiausaha (JSU)'
    when 'BENDAHARI' then 'Bendahari Kehormat (BK)'
    when 'LAJNAH TARBIAH' then 'Lajnah Tarbiah (LT)'
    when 'LAJNAH PERKADERAN' then 'Lajnah Perkaderan (LP)'
    when 'LAJNAH HAL EHWAL SEKOLAH & ALUMNI' then 'Lajnah Hal Ehwal Sekolah & Alumni (LHESA)'
    when 'LAJNAH PEMBANGUNAN GENERASI' then 'Lajnah Pembangunan Generasi (LPG)'
    when 'LAJNAH PEMBANGUNAN NGO' then 'Lajnah Pembangunan NGO (LPN)'
    when 'LAJNAH KEBAJIKAN' then 'Lajnah Kebajikan (LK)'
    when 'KESIHATAN AHLI' then 'LK — Kesihatan Ahli'
    when 'TABUNG ZAKAT' then 'LK — Tabung Zakat'
    when 'LAJNAH MUSLIMAT' then 'Lajnah Muslimat (LM)'
    when 'LAJNAH EKONOMI DAN ASET' then 'Lajnah Ekonomi & Aset (LEA)'
    when 'JABATAN DATA & SUMBER MANUSIA' then 'Jabatan Data & Sumber Manusia (JDSM)'
    when 'I-GEM' then 'Ikhwan Generasi Muda (I-GEM)'
    else p_name
  end;
$$;

revoke all on function public.feedback_admin_threads(uuid) from public, anon;
revoke all on function public.feedback_admin_unread_by_dept() from public, anon;
revoke all on function public.feedback_department_label(text) from public, anon;
grant execute on function public.feedback_admin_threads(uuid) to authenticated;
grant execute on function public.feedback_admin_unread_by_dept() to authenticated;
grant execute on function public.feedback_department_label(text) to authenticated;

create or replace function public.admin_notifications()
returns table (
  kind    text,
  title   text,
  preview text,
  jumlah  integer,
  terbaru timestamptz,
  route   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
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

  return;
end;
$$;

notify pgrst, 'reload schema';
