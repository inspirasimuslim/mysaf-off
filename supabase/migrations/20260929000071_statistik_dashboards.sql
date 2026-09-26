-- =============================================================================
-- Dashboard Statistik — Tarbiah, Perkaderan, PIPIS, Yuran
--
-- Empat RPC, satu setiap dashboard. Setiap satu memulangkan SATU objek JSON
-- berisi kiraan agregat sahaja (tiada baris individu ahli, kecuali nama
-- naqib pada dashboard Perkaderan — sama seperti `perkaderan_naqib_list()`).
--
-- Kebenaran: SAMA seperti modul asal, melalui fungsi sedia ada —
--   stat_tarbiah    → can_view_usrah()       (LAJNAH TARBIAH)
--   stat_perkaderan → can_view_perkaderan()  (LAJNAH PERKADERAN)
--   stat_pipis      → can_view_pipis()       (LAJNAH EKONOMI DAN ASET)
--   stat_yuran      → can_view_yuran()       (BENDAHARI)
-- Kesemuanya melalui `has_department_access()`, jadi Super Admin lulus dan
-- akaun disekat / kata laluan sementara tidak.
--
-- Formula TIDAK direka baharu:
--   * PIPIS: jumlah ahli = `members`; sumbangan = status 'success'; sasaran =
--     `pipis_target()`; baki setiap ahli dilantaikan pada 0 (lebihan seorang
--     tidak menolak baki orang lain) — sama seperti status "Belum Cukup".
--   * Yuran: tunggakan seorang ahli = jumlah caj ledger − bayaran 'success',
--     dilantaikan pada 0 — sama seperti `yuran_year_report()`. Untuk tahun
--     dipilih Y, caj dan bayaran dihadkan kepada tahun ≤ Y (kaedah sama
--     `activity_scores_internal()`).
-- Bulan bagi kutipan mengikut `created_at` (zon Asia/Kuala_Lumpur).
-- =============================================================================

create or replace function public._stat_deny()
returns void
language plpgsql
as $$
begin
  raise exception 'Anda tiada kebenaran melihat statistik ini.' using errcode = 'MS001';
end;
$$;
revoke all on function public._stat_deny() from public, anon, authenticated;


-- --- TARBIAH -----------------------------------------------------------------

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
    )
  ) into v_result;

  return v_result;
end;
$$;


-- --- PERKADERAN ---------------------------------------------------------------

create or replace function public.stat_perkaderan(p_year int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.can_view_perkaderan(), false) then
    perform public._stat_deny();
  end if;

  with naqib as (
    -- Naqib aktif + kumpulan aktif mereka. Naqib tanpa kumpulan aktif tetap
    -- dikira, di bawah sekolah 'Belum ada kumpulan'.
    select
      m.full_name as nama,
      coalesce(g.sekolah, 'Belum ada kumpulan') as sekolah,
      g.group_name as kumpulan,
      coalesce((select count(*) from public.sekolah_usrah_mad_u mu where mu.group_id = g.id and mu.is_active), 0) as mad_u
    from public.perkaderan_naqib_assignments a
    join public.members m on m.id = a.member_id
    left join public.sekolah_usrah_groups g on g.naqib_member_id = m.id and g.is_active
    where a.is_active
  ),
  sesi as (
    select extract(month from s.session_date)::int as bulan
    from public.sekolah_usrah_sessions s
    where extract(year from s.session_date)::int = p_year
  )
  select jsonb_build_object(
    'years', (
      select coalesce(jsonb_agg(y order by y desc), '[]'::jsonb) from (
        select distinct extract(year from session_date)::int as y from public.sekolah_usrah_sessions
        union select extract(year from now())::int
      ) s
    ),
    'jumlah_naqib', (select count(distinct nama) from naqib),
    'jumlah_sesi', (select count(*) from sesi),
    'sesi_bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object('bulan', mo, 'sesi', coalesce(x.n, 0)) order by mo), '[]'::jsonb)
      from generate_series(1, 12) mo
      left join (select bulan, count(*) as n from sesi group by 1) x on x.bulan = mo
    ),
    'sekolah', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'sekolah', t.sekolah,
        'bilangan_naqib', t.bil,
        'naqib', t.senarai
      ) order by t.sekolah), '[]'::jsonb)
      from (
        select
          sekolah,
          count(distinct nama) as bil,
          jsonb_agg(jsonb_build_object('nama', nama, 'kumpulan', kumpulan, 'mad_u', mad_u) order by nama) as senarai
        from naqib
        group by sekolah
      ) t
    )
  ) into v_result;

  return v_result;
end;
$$;


-- --- PIPIS --------------------------------------------------------------------

create or replace function public.stat_pipis(p_year int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_target numeric := public.pipis_target();
begin
  if not coalesce(public.can_view_pipis(), false) then
    perform public._stat_deny();
  end if;

  with per_ahli as (
    select
      m.id,
      coalesce(m.generasi, 'Tiada Rekod') as generasi,
      coalesce((
        select sum(c.amount) from public.pipis_contributions c
        where c.member_id = m.id and c.status = 'success'
      ), 0) as total
    from public.members m
  ),
  gen as (
    select generasi,
           coalesce(nullif(regexp_replace(generasi, '\D', '', 'g'), '')::int, 9999) as ord,
           count(*) as ahli,
           sum(total) as jumlah,
           sum(greatest(v_target - total, 0)) as baki
    from per_ahli group by generasi
  ),
  bulan as (
    select extract(month from c.created_at at time zone 'Asia/Kuala_Lumpur')::int as bulan, sum(c.amount) as jumlah
    from public.pipis_contributions c
    where c.status = 'success'
      and extract(year from c.created_at at time zone 'Asia/Kuala_Lumpur')::int = p_year
    group by 1
  )
  select jsonb_build_object(
    'years', (
      select coalesce(jsonb_agg(y order by y desc), '[]'::jsonb) from (
        select distinct extract(year from created_at at time zone 'Asia/Kuala_Lumpur')::int as y
        from public.pipis_contributions where status = 'success'
        union select extract(year from now())::int
      ) s
    ),
    'bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object('bulan', mo, 'jumlah', coalesce(b.jumlah, 0)) order by mo), '[]'::jsonb)
      from generate_series(1, 12) mo left join bulan b on b.bulan = mo
    ),
    'jumlah_tahun', (select coalesce(sum(jumlah), 0) from bulan),
    'generasi', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'generasi', generasi, 'ahli', ahli, 'jumlah', jumlah, 'baki', baki
      ) order by ord, generasi), '[]'::jsonb)
      from gen
    ),
    'ringkasan', jsonb_build_object(
      'jumlah_ahli', (select count(*) from per_ahli),
      'sasaran_seorang', v_target,
      'sasaran_jumlah', (select count(*) from per_ahli) * v_target,
      'terkumpul', (select coalesce(sum(total), 0) from per_ahli),
      'baki', (select coalesce(sum(greatest(v_target - total, 0)), 0) from per_ahli),
      'ahli_cukup', (select count(*) from per_ahli where total >= v_target)
    )
  ) into v_result;

  return v_result;
end;
$$;


-- --- YURAN --------------------------------------------------------------------

create or replace function public.stat_yuran(p_year int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.can_view_yuran(), false) then
    perform public._stat_deny();
  end if;

  with per_ahli as (
    select
      m.id,
      coalesce(m.generasi, 'Tiada Rekod') as generasi,
      greatest(
        coalesce((select sum(l.amount_due) from public.yuran_ledger l where l.member_id = m.id and l.year <= p_year), 0)
        - coalesce((select sum(p.amount) from public.yuran_payments p
                    where p.member_id = m.id and p.year <= p_year and p.status = 'success'), 0),
        0
      ) as tunggak
    from public.members m
  ),
  gen as (
    select generasi,
           coalesce(nullif(regexp_replace(generasi, '\D', '', 'g'), '')::int, 9999) as ord,
           sum(tunggak) as tunggak,
           count(*) filter (where tunggak > 0) as ahli_tertunggak
    from per_ahli group by generasi
  ),
  -- Baki permulaan ('import_opening') ialah lejar terbawa, bukan kutipan bulan itu.
  bulan as (
    select extract(month from p.created_at at time zone 'Asia/Kuala_Lumpur')::int as bulan, sum(p.amount) as jumlah
    from public.yuran_payments p
    where p.status = 'success'
      and p.method <> 'import_opening'
      and extract(year from p.created_at at time zone 'Asia/Kuala_Lumpur')::int = p_year
    group by 1
  )
  select jsonb_build_object(
    'years', (
      select coalesce(jsonb_agg(y order by y desc), '[]'::jsonb) from (
        select distinct year as y from public.yuran_ledger
        union select extract(year from now())::int
      ) s
    ),
    'bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object('bulan', mo, 'jumlah', coalesce(b.jumlah, 0)) order by mo), '[]'::jsonb)
      from generate_series(1, 12) mo left join bulan b on b.bulan = mo
    ),
    'jumlah_kutipan_tahun', (select coalesce(sum(jumlah), 0) from bulan),
    'tunggakan', jsonb_build_object(
      'jumlah', (select coalesce(sum(tunggak), 0) from per_ahli),
      'ahli_tertunggak', (select count(*) from per_ahli where tunggak > 0),
      'jumlah_ahli', (select count(*) from per_ahli)
    ),
    'tunggakan_generasi', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'generasi', generasi, 'tunggak', tunggak, 'ahli_tertunggak', ahli_tertunggak
      ) order by ord, generasi), '[]'::jsonb)
      from gen
    )
  ) into v_result;

  return v_result;
end;
$$;


revoke all on function public.stat_tarbiah(int) from public, anon;
revoke all on function public.stat_perkaderan(int) from public, anon;
revoke all on function public.stat_pipis(int) from public, anon;
revoke all on function public.stat_yuran(int) from public, anon;
grant execute on function public.stat_tarbiah(int) to authenticated;
grant execute on function public.stat_perkaderan(int) to authenticated;
grant execute on function public.stat_pipis(int) to authenticated;
grant execute on function public.stat_yuran(int) to authenticated;

notify pgrst, 'reload schema';
