-- =============================================================================
-- mysaf-off — Rumusan keseluruhan ahli (statistik agregat)
--
-- Jalankan SELEPAS 20260913000019_temp_password_rotation.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Satu fungsi yang memulangkan SATU objek JSON berisi KIRAAN sahaja — tiada
-- nama, tiada id, tiada satu baris individu pun. Ia dibuka kepada setiap ahli
-- yang boleh membaca data bersama (`can_read_shared()`: akaun ahli yang aktif,
-- tidak disekat dan tidak memegang kata laluan sementara), bukan hanya admin.
--
-- `security definer` diperlukan kerana RLS `members` menyembunyikan baris orang
-- lain daripada ahli biasa. Yang keluar dari fungsi ini hanyalah `count(*)`
-- yang dikumpul mengikut kategori; setiap kategori ialah satu dimensi sahaja
-- (tiada silang seperti "jantina × generasi"), jadi kiraan kecil — contoh satu
-- ahli di Usrah Antarabangsa — tidak boleh digabungkan untuk mengenal pasti
-- seseorang.
--
-- Kategori "tiada data" dinamakan secara konsisten ('Tiada Rekod',
-- 'Lain-lain / Tiada Rekod', 'Tidak Dapat Dikenal Pasti') supaya app boleh
-- mewarnakannya kelabu dan bukan sebagai kategori sebenar.
-- =============================================================================

create or replace function public.member_statistics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.can_read_shared(), false) then
    raise exception 'Rumusan ahli hanya untuk akaun ahli yang aktif.' using errcode = 'MS001';
  end if;

  with m as (
    select
      lower(nullif(trim(jantina), '')) as jantina,
      generasi,
      -- Ruang berganda dirapatkan supaya 'SMKA  FALAHIAH' tetap sepadan.
      upper(regexp_replace(trim(coalesce(sekolah, '')), '\s+', ' ', 'g')) as sekolah,
      upper(nullif(trim(kawasan_usrah), '')) as kawasan,
      status_pekerjaan,
      status_perkahwinan,
      upper(coalesce(nullif(trim(alamat_semasa), ''), nullif(trim(alamat), ''))) as alamat
    from public.members
  )
  select jsonb_build_object(
    'total_ahli', (select count(*) from m),

    -- --- Jantina: dua kategori tetap + tiada rekod -------------------------
    'ikut_jantina', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (values (1, 'Muslimin'), (2, 'Muslimat'), (3, 'Tiada Rekod')) as k(ord, label)
      left join (
        select
          case
            when jantina in ('muslimin', 'lelaki') then 'Muslimin'
            when jantina in ('muslimat', 'perempuan') then 'Muslimat'
            else 'Tiada Rekod'
          end as label,
          count(*) as jumlah
        from m
        group by 1
      ) c on c.label = k.label
    ),

    -- --- Generasi: SEMUA generasi termasuk yang tiada ahli, urutan numerik --
    'ikut_generasi', (
      select jsonb_agg(jsonb_build_object('label', s.label, 'count', s.jumlah) order by s.ord, s.label)
      from (
        select
          g.code as label,
          coalesce(nullif(regexp_replace(g.code, '\D', '', 'g'), '')::int, 9999) as ord,
          count(m.generasi) as jumlah
        from public.generations g
        left join m on m.generasi = g.code
        group by g.code
        union all
        -- Hanya muncul bila ada ahli tanpa generasi yang sah.
        select 'Tiada Rekod', 100000, count(*)
        from m
        where m.generasi is null or m.generasi not in (select code from public.generations)
        having count(*) > 0
      ) s
    ),

    -- --- Sekolah: senarai tetap, padanan tanpa mengira huruf besar/kecil ----
    -- 'SMK DAMANSARA' dalam data dianggap sekolah yang sama dengan
    -- 'SMK KOTA DAMANSARA'.
    'ikut_sekolah', (
      with senarai(ord, label, alias) as (
        values
          (1, 'SMKA FALAHIAH', array['SMKA FALAHIAH']),
          (2, 'SMKA NAIM LILBANAT', array['SMKA NAIM LILBANAT']),
          (3, 'SMKA TOK BACHOK', array['SMKA TOK BACHOK']),
          (4, 'MAAHAD MUHAMMADI PASIR MAS', array['MAAHAD MUHAMMADI PASIR MAS']),
          (5, 'MAAHAD AMIR INDERA PETRA', array['MAAHAD AMIR INDERA PETRA']),
          (6, 'SMA TG AMALIN AISYAH', array['SMA TG AMALIN AISYAH']),
          (7, 'SMK KOTA DAMANSARA', array['SMK KOTA DAMANSARA', 'SMK DAMANSARA'])
      ),
      kiraan as (
        select coalesce(s.label, 'Lain-lain / Tiada Rekod') as label, count(*) as jumlah
        from m
        left join senarai s on m.sekolah = any (s.alias)
        group by 1
      )
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (select ord, label from senarai union all select 8, 'Lain-lain / Tiada Rekod') k
      left join kiraan c on c.label = k.label
    ),

    -- --- Kawasan usrah: 8 kod sah + tiada rekod (nilai di luar kod juga) ----
    'ikut_kawasan_usrah', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (
        values (1, 'US'), (2, 'ULK'), (3, 'UU'), (4, 'UPT'), (5, 'UT'), (6, 'UTS'), (7, 'UB'), (8, 'UA'), (9, 'Tiada Rekod')
      ) as k(ord, label)
      left join (
        select
          case
            when kawasan in ('US', 'ULK', 'UU', 'UPT', 'UT', 'UTS', 'UB', 'UA') then kawasan
            else 'Tiada Rekod'
          end as label,
          count(*) as jumlah
        from m
        group by 1
      ) c on c.label = k.label
    ),

    -- --- Status pekerjaan: semua kategori sedia ada, label BM --------------
    'ikut_status_pekerjaan', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (
        values
          (1, 'bekerja', 'Bekerja'),
          (2, 'belajar_sepenuh_masa', 'Belajar Sepenuh Masa'),
          (3, 'bekerja_dan_belajar', 'Bekerja & Belajar'),
          (4, 'berniaga_usahawan', 'Berniaga / Usahawan'),
          (5, 'suri_rumah', 'Suri Rumah'),
          (6, 'tidak_bekerja', 'Tidak Bekerja'),
          (7, 'pesara', 'Pesara'),
          (8, null, 'Tiada Rekod')
      ) as k(ord, kod, label)
      left join (
        select coalesce(status_pekerjaan, '') as kod, count(*) as jumlah
        from m
        group by 1
      ) c on c.kod = coalesce(k.kod, '')
    ),

    -- --- Status perkahwinan ------------------------------------------------
    'ikut_status_perkahwinan', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (
        values
          (1, 'bujang', 'Bujang'),
          (2, 'berkahwin_mbm', 'Berkahwin (MBM)'),
          (3, 'berkahwin_bukan_mbm', 'Berkahwin (Bukan MBM)'),
          (4, null, 'Tiada Rekod')
      ) as k(ord, kod, label)
      left join (
        select coalesce(status_perkahwinan, '') as kod, count(*) as jumlah
        from m
        group by 1
      ) c on c.kod = coalesce(k.kod, '')
    ),

    /*
      --- Negeri: ANGGARAN BEST-EFFORT daripada teks alamat -------------------

      Tiada kolum negeri dalam `members`. Negeri disimpulkan daripada
      `alamat_semasa`, atau `alamat` bila alamat semasa kosong, dengan mencari
      nama negeri dalam teks (setara ILIKE '%SELANGOR%' dan seterusnya, termasuk
      ejaan lain: PENANG / P. PINANG, TRENGGANU, N. SEMBILAN, MALACCA).

      Bila teks mengandungi LEBIH DARIPADA SATU nama negeri — contoh 'JALAN
      PERAK, 50450 KUALA LUMPUR' — negeri yang muncul PALING HAMPIR HUJUNG alamat
      dipilih, kerana alamat Malaysia menulis negeri di hujung. Satu CASE WHEN
      mengikut susunan akan memilih PERAK di sini hanya kerana ia disemak dahulu.

      Alamat kosong atau tanpa nama negeri → 'Tidak Dapat Dikenal Pasti'. Hanya
      negeri yang mempunyai sekurang-kurangnya seorang ahli dipulangkan.
    */
    'ikut_negeri', (
      with corak(negeri, teks) as (
        values
          ('Selangor', 'SELANGOR'),
          ('Kuala Lumpur', 'KUALA LUMPUR'),
          ('Johor', 'JOHOR'),
          ('Perak', 'PERAK'),
          ('Kedah', 'KEDAH'),
          ('Pulau Pinang', 'PULAU PINANG'),
          ('Pulau Pinang', 'PENANG'),
          ('Pulau Pinang', 'P. PINANG'),
          ('Pulau Pinang', 'P.PINANG'),
          ('Pahang', 'PAHANG'),
          ('Terengganu', 'TERENGGANU'),
          ('Terengganu', 'TRENGGANU'),
          ('Kelantan', 'KELANTAN'),
          ('Negeri Sembilan', 'NEGERI SEMBILAN'),
          ('Negeri Sembilan', 'N. SEMBILAN'),
          ('Negeri Sembilan', 'N.SEMBILAN'),
          ('Melaka', 'MELAKA'),
          ('Melaka', 'MALACCA'),
          ('Perlis', 'PERLIS'),
          ('Sabah', 'SABAH'),
          ('Sarawak', 'SARAWAK'),
          ('Putrajaya', 'PUTRAJAYA'),
          ('Labuan', 'LABUAN')
      ),
      dikesan as (
        select coalesce(
          (
            select c.negeri
            from corak c
            where strpos(m.alamat, c.teks) > 0
            -- Kedudukan dari hujung: nilai kecil = lebih hampir hujung alamat.
            order by strpos(reverse(m.alamat), reverse(c.teks)), length(c.teks) desc
            limit 1
          ),
          'Tidak Dapat Dikenal Pasti'
        ) as negeri
        from m
      )
      select jsonb_agg(
        jsonb_build_object('label', negeri, 'count', jumlah)
        order by (negeri = 'Tidak Dapat Dikenal Pasti'), jumlah desc, negeri
      )
      from (select negeri, count(*) as jumlah from dikesan group by negeri) s
    ),

    'dijana_pada', now()
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.member_statistics() from public, anon;
grant execute on function public.member_statistics() to authenticated;

notify pgrst, 'reload schema';
