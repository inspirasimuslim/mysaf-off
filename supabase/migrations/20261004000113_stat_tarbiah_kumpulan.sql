-- =============================================================================
-- mysaf-off — Statistik Tarbiah: tambah pemantauan Kumpulan Usrah
--
-- Susulan terus migration 112 (`kumpulan_usrah.sql`) — "masukkan juga dalam
-- statistik" ialah sebahagian permintaan yang sama. Salinan PENUH
-- `stat_tarbiah()` daripada `20260929000071_statistik_dashboards.sql` + DUA
-- kunci baharu pada jsonb hasil:
--   * `kumpulan_usrah`      — satu baris setiap kumpulan: kawasan, nama,
--     jumlah ahli, senarai nama naqib.
--   * `kumpulan_usrah_liputan` — satu baris setiap kawasan: jumlah ahli,
--     berapa yang sudah dalam mana-mana kumpulan, jumlah kumpulan wujud —
--     ukuran "liputan" kumpulan usrah, bukan kehadiran.
-- Tiada kunci sedia ada diubah; tandatangan fungsi tidak berubah (create or
-- replace mencukupi).
-- =============================================================================

create or replace function public.stat_tarbiah(p_year int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.can_view_usrah(), false) then
    perform public._stat_deny();
  end if;

  with m as (
    select
      id,
      coalesce(upper(nullif(trim(kawasan_usrah), '')), 'Tiada Rekod') as kawasan,
      coalesce(generasi, 'Tiada Rekod') as generasi
    from public.members
  ),
  a as (
    select u.month, m.kawasan, m.generasi,
           (u.attended is true) as hadir,
           (u.attended is not null) as direkod
    from public.usrah_monthly_attendance u
    join m on m.id = u.member_id
    where u.year = p_year
  ),
  kaw as (select distinct kawasan from m),
  gen as (
    select distinct m.generasi,
           coalesce(nullif(regexp_replace(m.generasi, '\D', '', 'g'), '')::int, 9999) as ord
    from m
  )
  select jsonb_build_object(
    'years', (
      select coalesce(jsonb_agg(y order by y desc), '[]'::jsonb) from (
        select distinct year as y from public.usrah_monthly_attendance where attended is not null
        union select extract(year from now())::int
      ) s
    ),
    'jumlah_ahli', (select count(*) from m),
    'kawasan_bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kawasan', k.kawasan, 'bulan', mo,
        'hadir', coalesce(x.hadir, 0), 'direkod', coalesce(x.direkod, 0),
        'peratus', case when coalesce(x.direkod, 0) = 0 then null else round(x.hadir * 100.0 / x.direkod, 1) end
      ) order by k.kawasan, mo), '[]'::jsonb)
      from kaw k cross join generate_series(1, 12) mo
      left join (
        select kawasan, month, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1, 2
      ) x on x.kawasan = k.kawasan and x.month = mo
    ),
    'semua_bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bulan', mo,
        'hadir', coalesce(x.hadir, 0), 'direkod', coalesce(x.direkod, 0),
        'peratus', case when coalesce(x.direkod, 0) = 0 then null else round(x.hadir * 100.0 / x.direkod, 1) end
      ) order by mo), '[]'::jsonb)
      from generate_series(1, 12) mo
      left join (
        select month, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1
      ) x on x.month = mo
    ),
    'generasi_bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'generasi', g.generasi, 'bulan', mo,
        'hadir', coalesce(x.hadir, 0), 'direkod', coalesce(x.direkod, 0),
        'peratus', case when coalesce(x.direkod, 0) = 0 then null else round(x.hadir * 100.0 / x.direkod, 1) end
      ) order by g.ord, g.generasi, mo), '[]'::jsonb)
      from gen g cross join generate_series(1, 12) mo
      left join (
        select generasi, month, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1, 2
      ) x on x.generasi = g.generasi and x.month = mo
    ),
    'kawasan_tahunan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kawasan', kawasan, 'hadir', hadir, 'direkod', direkod,
        'peratus', case when direkod = 0 then null else round(hadir * 100.0 / direkod, 1) end
      ) order by kawasan), '[]'::jsonb)
      from (
        select kawasan, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1
      ) t
    ),
    'generasi_tahunan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'generasi', t.generasi, 'hadir', t.hadir, 'direkod', t.direkod,
        'peratus', case when t.direkod = 0 then null else round(t.hadir * 100.0 / t.direkod, 1) end
      ) order by coalesce(nullif(regexp_replace(t.generasi, '\D', '', 'g'), '')::int, 9999), t.generasi), '[]'::jsonb)
      from (
        select generasi, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1
      ) t
    ),
    'kawasan_ahli', (
      select coalesce(jsonb_agg(jsonb_build_object('label', kawasan, 'count', n) order by n desc, kawasan), '[]'::jsonb)
      from (select kawasan, count(*) as n from m group by 1) s
    ),
    'kumpulan_usrah', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kawasan', ku.kawasan_usrah,
        'nama', ku.nama,
        'jumlah_ahli', coalesce(mc.n, 0),
        'naqib', coalesce(nq.names, '[]'::jsonb)
      ) order by ku.kawasan_usrah, ku.nama), '[]'::jsonb)
      from public.kumpulan_usrah ku
      left join (
        select kumpulan_id, count(*) as n from public.kumpulan_usrah_members group by 1
      ) mc on mc.kumpulan_id = ku.id
      left join (
        select kn.kumpulan_id, jsonb_agg(mm.full_name order by mm.full_name) as names
        from public.kumpulan_usrah_naqib kn
        join public.members mm on mm.id = kn.member_id
        group by 1
      ) nq on nq.kumpulan_id = ku.id
    ),
    'kumpulan_usrah_liputan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kawasan', s.kawasan,
        'jumlah_ahli', s.jumlah_ahli,
        'ahli_berkumpulan', s.ahli_berkumpulan,
        'jumlah_kumpulan', s.jumlah_kumpulan
      ) order by s.kawasan), '[]'::jsonb)
      from (
        select
          m.kawasan,
          count(*) as jumlah_ahli,
          count(*) filter (where kum.member_id is not null) as ahli_berkumpulan,
          (select count(*) from public.kumpulan_usrah ku2 where ku2.kawasan_usrah = m.kawasan) as jumlah_kumpulan
        from m
        left join public.kumpulan_usrah_members kum on kum.member_id = m.id
        group by m.kawasan
      ) s
    )
  ) into v_result;

  return v_result;
end;
$$;

notify pgrst, 'reload schema';
