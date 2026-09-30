-- =============================================================================
-- mysaf-off — Eksport Yuran / PIPIS / Usrah Sekolah: lajur tambahan (audit)
--
-- Jalankan SELEPAS 20260929000093_member_export_lajur_tambahan.sql.
--
--   1. yuran_transactions_export()  +tahun, +gateway_reference,
--      +rujukan_kumpulan (bayaran kumpulan vs pelarasan manual biasa),
--      +direkod_oleh (nama admin yang merekod: import DAN pelarasan manual; kosong bagi bayaran online).
--   2. pipis_transactions_export()  +gateway_reference, +direkod_oleh.
--   3. yuran_year_report()          +caj_ialah_baki_permulaan — baris 2025
--      ialah HUTANG TERKUMPUL (yuran_ledger.is_opening_balance), bukan caj setahun.
--   4. perkaderan_export()          +status_kumpulan (Aktif/Diarkib) pada kedua-dua
--      helaian, +status_mad_u (Aktif/Tidak Aktif) pada helaian terperinci.
--
-- Bentuk pulangan (1)-(3) bertukar -> drop+create (kunci: nama+grant diulang).
-- (4) memulangkan jsonb, jadi `create or replace`. Tiada data diubah.
-- `direkod_oleh` (dari created_by): nama ahli (members.user_id = created_by), jika tiada rekod
-- ahli guna emel akaun.
-- =============================================================================


drop function if exists public.yuran_transactions_export(integer);

create function public.yuran_transactions_export(p_year integer default null)
returns table (
  nombor_ahli       text,
  full_name         text,
  generasi          text,
  tahun             integer,
  created_at        timestamptz,
  amount            numeric,
  requested_amount  numeric,
  method            text,
  status            text,
  gateway_bill_code text,
  gateway_reference text,
  rujukan_kumpulan  text,
  direkod_oleh      text,
  note              text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
    p.year,
    p.created_at,
    p.amount,
    p.requested_amount,
    p.method,
    p.status,
    p.gateway_bill_code,
    p.gateway_reference,
    case
      when g.id is null then null
      else 'Kumpulan '
        || case when g.generasi ~ '^i[0-9]{2}$' then 'Ikhwan ' || substring(g.generasi from 2) else g.generasi end
        || ' #' || left(g.id::text, 8)
    end,
    coalesce(cm.full_name, cu.email::text),
    p.note
  from public.yuran_payments p
  join public.members m on m.id = p.member_id
  left join public.yuran_group_payments g on g.id = p.group_payment_id
  left join public.members cm on cm.user_id = p.created_by
  left join auth.users cu on cu.id = p.created_by
  where public.can_view_yuran()
    -- `p_year` null = seluruh sejarah; bayaran tersangkut tidak semestinya
    -- berada dalam tahun yang sedang dilihat.
    and (p_year is null or p.year = p_year)
  order by p.created_at desc;
$$;

revoke all on function public.yuran_transactions_export(integer) from public, anon;
grant execute on function public.yuran_transactions_export(integer) to authenticated;


drop function if exists public.pipis_transactions_export();

create function public.pipis_transactions_export()
returns table (
  nombor_ahli       text,
  full_name         text,
  generasi          text,
  created_at        timestamptz,
  amount            numeric,
  requested_amount  numeric,
  method            text,
  status            text,
  gateway_bill_code text,
  gateway_reference text,
  direkod_oleh      text,
  note              text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
    c.created_at,
    c.amount,
    c.requested_amount,
    c.method,
    c.status,
    c.gateway_bill_code,
    c.gateway_reference,
    coalesce(cm.full_name, cu.email::text),
    c.note
  from public.pipis_contributions c
  join public.members m on m.id = c.member_id
  left join public.members cm on cm.user_id = c.created_by
  left join auth.users cu on cu.id = c.created_by
  where public.can_view_pipis()
  order by c.created_at desc;
$$;

revoke all on function public.pipis_transactions_export() from public, anon;
grant execute on function public.pipis_transactions_export() to authenticated;


drop function if exists public.yuran_year_report(integer);

create function public.yuran_year_report(p_year integer)
returns table (
  member_id   uuid,
  nombor_ahli text,
  full_name   text,
  generasi    text,
  caj_tahun   numeric,
  bayar_tahun numeric,
  tertunggak  numeric,
  kredit      numeric,
  status      text,
  caj_ialah_baki_permulaan boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with baki as (
    select
      m.id,
      m.nombor_ahli,
      m.full_name,
      m.generasi,
      coalesce((select sum(l.amount_due) from public.yuran_ledger l where l.member_id = m.id), 0)
        - coalesce((select sum(p.amount) from public.yuran_payments p where p.member_id = m.id and p.status = 'success'), 0)
        as net,
      coalesce((select sum(l.amount_due) from public.yuran_ledger l where l.member_id = m.id and l.year = p_year), 0)
        as caj_tahun,
      coalesce((select sum(p.amount) from public.yuran_payments p where p.member_id = m.id and p.year = p_year and p.status = 'success'), 0)
        as bayar_tahun,
      exists (
        select 1 from public.yuran_ledger l
        where l.member_id = m.id and l.year = p_year and l.is_opening_balance
      ) as opening
    from public.members m
    where public.can_view_yuran()
  )
  select
    b.id,
    b.nombor_ahli,
    b.full_name,
    b.generasi,
    b.caj_tahun,
    b.bayar_tahun,
    -- Hutang dan kredit dipisahkan supaya satu kolum tidak perlu dibaca dengan
    -- tandanya; nombor negatif dalam ruangan "tertunggak" sentiasa disalah baca.
    greatest(b.net, 0)  as tertunggak,
    greatest(-b.net, 0) as kredit,
    case
      when b.net > 0 then 'Tertunggak'
      when b.net < 0 then 'Kredit'
      else 'Lunas'
    end as status,
    b.opening
  from baki b
  order by b.nombor_ahli nulls last, b.full_name;
$$;

revoke all on function public.yuran_year_report(integer) from public, anon;
grant execute on function public.yuran_year_report(integer) to authenticated;


create or replace function public.perkaderan_export(p_group_id uuid default null, p_month int default null, p_year int default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Eksport ini hanya untuk admin LAJNAH PERKADERAN.' using errcode = 'PK001';
  end if;

  with relevant_groups as (
    select g.id, g.group_name, g.sekolah, g.is_active as group_active, m.full_name as naqib_name
    from public.sekolah_usrah_groups g
    join public.members m on m.id = g.naqib_member_id
    where p_group_id is null or g.id = p_group_id
  ),
  session_summary as (
    select
      rg.group_name,
      rg.naqib_name,
      rg.sekolah,
      rg.group_active,
      s.id as session_id,
      s.session_date,
      s.location_text,
      s.topik,
      pm.full_name as partner_naqib_name,
      s.partner_naqib_hadir,
      (select count(*) from public.sekolah_usrah_attendance a where a.session_id = s.id) as bilangan_hadir
    from public.sekolah_usrah_sessions s
    join relevant_groups rg on rg.id = s.group_id
    left join public.members pm on pm.id = s.partner_naqib_member_id
    where (p_month is null or extract(month from s.session_date) = p_month)
      and (p_year is null or extract(year from s.session_date) = p_year)
  ),
  -- Mad'u relevan bagi setiap sesi: AKTIF sekarang, PLUS mana-mana mad'u yang
  -- sudah dibuang tetapi ada rekod hadir sejarah pada sesi itu — sejarah tidak
  -- pernah hilang daripada laporan walaupun mad'u itu sudah tiada dalam senarai.
  relevant_mad_u as (
    select s.id as session_id, mu.id as mad_u_id, mu.nama, mu.tingkatan, mu.is_active as mad_u_active
    from public.sekolah_usrah_sessions s
    join relevant_groups rg on rg.id = s.group_id
    join public.sekolah_usrah_mad_u mu on mu.group_id = s.group_id and mu.is_active = true
    union
    select a.session_id, mu.id, mu.nama, mu.tingkatan, mu.is_active
    from public.sekolah_usrah_attendance a
    join public.sekolah_usrah_mad_u mu on mu.id = a.mad_u_id
    join public.sekolah_usrah_sessions s on s.id = a.session_id
    join relevant_groups rg on rg.id = s.group_id
  ),
  -- `detail` bercantum dengan `session_summary` (bukan `sekolah_usrah_sessions`
  -- terus), jadi tapisan bulan/tahun di atas terpakai automatik di sini juga.
  detail as (
    select
      ss.group_name,
      ss.group_active,
      rm.nama,
      rm.tingkatan,
      rm.mad_u_active,
      ss.session_date,
      ss.partner_naqib_name,
      ss.partner_naqib_hadir,
      exists (
        select 1 from public.sekolah_usrah_attendance a
        where a.session_id = rm.session_id and a.mad_u_id = rm.mad_u_id
      ) as hadir
    from relevant_mad_u rm
    join session_summary ss on ss.session_id = rm.session_id
  )
  select jsonb_build_object(
    'ringkasan_sesi', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'kumpulan', group_name,
          'naqib', naqib_name,
          'sekolah', sekolah,
          'status_kumpulan', case when group_active then 'Aktif' else 'Diarkib' end,
          'tarikh', session_date,
          'lokasi', location_text,
          'topik', topik,
          'bilangan_hadir', bilangan_hadir,
          'partner_naqib', partner_naqib_name,
          'partner_hadir', case when partner_naqib_name is null then null else partner_naqib_hadir end
        ) order by group_name, session_date
      ), '[]'::jsonb)
      from session_summary
    ),
    'kehadiran_terperinci', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'kumpulan', group_name,
          'status_kumpulan', case when group_active then 'Aktif' else 'Diarkib' end,
          'nama_mad_u', nama,
          'status_mad_u', case when mad_u_active then 'Aktif' else 'Tidak Aktif' end,
          'tingkatan', tingkatan,
          'tarikh_sesi', session_date,
          'hadir', hadir,
          'partner_naqib', partner_naqib_name,
          'partner_hadir', case when partner_naqib_name is null then null else partner_naqib_hadir end
        ) order by group_name, session_date, nama
      ), '[]'::jsonb)
      from detail
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.perkaderan_export(uuid, int, int) from public, anon;
grant execute on function public.perkaderan_export(uuid, int, int) to authenticated;

notify pgrst, 'reload schema';
