-- =============================================================================
-- mysaf-off — Tambah kawasan usrah UP (Usrah Perak)
--
-- Diminta 2026-10-05, susulan terus kepada migration 20261004000114 (gabung
-- UA+UB -> UA-UB, 8 kod jadi 7). Admin LAJNAH TARBIAH mengesahkan sheet "UP"
-- dalam fail sumber kumpulan usrah ialah kawasan sebenar (Usrah Perak) yang
-- belum pernah wujud dalam sistem — bukan data sisa/tidak relevan seperti
-- diandaikan sebelum ini. 7 kod jadi 8.
--
-- Tempat yang disentuh — SAMA senarai seperti migration 114 (punca tunggal
-- kod ialah KAWASAN_USRAH_OPTIONS, types/database.ts; DB menyalin senarai itu
-- pada 4 tempat berasingan kerana CHECK constraint/fungsi tidak boleh rujuk
-- terus pembolehubah app-side):
--   1. CHECK constraint `usrah_monthly_attendance_kawasan_check`
--   2. CHECK constraint `kumpulan_usrah_kawasan_usrah_check`
--   3. Fungsi `admin_set_usrah_attendance()` — senarai sah kawasan
--   4. Fungsi `member_statistics()` — `ikut_kawasan_usrah` (bucket + CASE)
--
-- Tiada data sedia ada disentuh (tambah kod, bukan padam/tukar) — tiada
-- snapshot backup diperlukan untuk migration ini sendiri.
-- =============================================================================


-- 1. CHECK constraint usrah_monthly_attendance.kawasan_attended --------------
alter table public.usrah_monthly_attendance drop constraint if exists usrah_monthly_attendance_kawasan_check;
alter table public.usrah_monthly_attendance add constraint usrah_monthly_attendance_kawasan_check
  check (kawasan_attended is null or kawasan_attended in ('US', 'ULK', 'UU', 'UPT', 'UT', 'UTS', 'UA-UB', 'UP'));

-- 2. CHECK constraint kumpulan_usrah.kawasan_usrah ----------------------------
alter table public.kumpulan_usrah drop constraint if exists kumpulan_usrah_kawasan_usrah_check;
alter table public.kumpulan_usrah add constraint kumpulan_usrah_kawasan_usrah_check
  check (kawasan_usrah in ('US','ULK','UU','UPT','UT','UTS','UA-UB','UP'));

-- 3. admin_set_usrah_attendance() — salinan penuh, senarai kod dikemas kini --
create or replace function public.admin_set_usrah_attendance(
  p_member_id        uuid,
  p_year             int,
  p_month            int,
  p_attended         boolean,
  p_kawasan_attended text,
  p_location_text    text,
  p_attended_date    date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kawasan  text := nullif(upper(trim(coalesce(p_kawasan_attended, ''))), '');
  v_location text := nullif(trim(coalesce(p_location_text, '')), '');
  v_date     date := p_attended_date;
  v_name     text;
begin
  if not coalesce(public.can_edit_usrah(), false) then
    raise exception 'Merekod kehadiran usrah memerlukan kebenaran menyunting pada LAJNAH TARBIAH.'
      using errcode = 'MS001';
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
    v_kawasan := null;
    v_location := null;
    v_date := null;
  end if;

  insert into public.usrah_monthly_attendance as t (
    member_id, year, month, attended, attendance_source,
    kawasan_attended, location_text, attended_date, recorded_by
  )
  values (p_member_id, p_year, p_month, p_attended, 'usrah', v_kawasan, v_location, v_date, 'admin')
  on conflict (member_id, year, month) do update
    set attended         = excluded.attended,
        kawasan_attended = excluded.kawasan_attended,
        location_text    = excluded.location_text,
        attended_date    = excluded.attended_date,
        recorded_by      = 'admin',
        updated_at       = now();

  perform public.log_admin_activity(
    'Kemas kini kehadiran usrah',
    'usrah_monthly_attendance',
    p_member_id::text,
    jsonb_build_object(
      'label', coalesce(v_name, 'Ahli') || ' · ' || lpad(p_month::text, 2, '0') || '/' || p_year,
      'hadir', p_attended,
      'kawasan', v_kawasan,
      'lokasi', v_location,
      'tarikh', v_date
    ),
    auth.uid()
  );
end;
$$;

revoke all on function public.admin_set_usrah_attendance(uuid, int, int, boolean, text, text, date) from public, anon;
grant execute on function public.admin_set_usrah_attendance(uuid, int, int, boolean, text, text, date) to authenticated;


-- 4. member_statistics() — salinan penuh daripada 20261004000114, hanya
--    'ikut_kawasan_usrah' bertukar 7 -> 8 kod. Bahagian lain (termasuk
--    'ikut_negeri' Luar Negara) TIDAK berubah.
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
      sekolah_id,
      upper(nullif(trim(kawasan_usrah), '')) as kawasan,
      status_pekerjaan,
      status_perkahwinan,
      upper(coalesce(nullif(trim(alamat_semasa), ''), nullif(trim(alamat), ''))) as alamat
    from public.members
  )
  select jsonb_build_object(
    'total_ahli', (select count(*) from m),

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
        select 'Tiada Rekod', 100000, count(*)
        from m
        where m.generasi is null or m.generasi not in (select code from public.generations)
        having count(*) > 0
      ) s
    ),

    -- --- Sekolah: JOIN dinamik kepada `schools` (senarai boleh berkembang) --
    'ikut_sekolah', (
      with kiraan as (
        select sekolah_id, count(*) as jumlah
        from m
        group by sekolah_id
      )
      select jsonb_agg(
        jsonb_build_object('label', coalesce(sc.nama, 'Tiada Rekod'), 'count', k.jumlah)
        order by (sc.nama is null), k.jumlah desc, sc.nama
      )
      from kiraan k
      left join public.schools sc on sc.id = k.sekolah_id
    ),

    -- --- Kawasan usrah: 8 kod (UP ditambah, 2026-10-05) ---------------------
    'ikut_kawasan_usrah', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (
        values (1, 'US'), (2, 'ULK'), (3, 'UU'), (4, 'UPT'), (5, 'UT'), (6, 'UTS'), (7, 'UA-UB'), (8, 'UP'), (9, 'Tiada Rekod')
      ) as k(ord, label)
      left join (
        select
          case
            when kawasan in ('US', 'ULK', 'UU', 'UPT', 'UT', 'UTS', 'UA-UB', 'UP') then kawasan
            else 'Tiada Rekod'
          end as label,
          count(*) as jumlah
        from m
        group by 1
      ) c on c.label = k.label
    ),

    'ikut_status_pekerjaan', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (
        values
          (1, 'bekerja', 'Bekerja'),
          (2, 'suri_rumah', 'Suri Rumah'),
          (3, 'tidak_bekerja', 'Tidak Bekerja'),
          (4, 'pesara', 'Pesara'),
          (5, null, 'Tiada Rekod')
      ) as k(ord, kod, label)
      left join (
        select coalesce(status_pekerjaan, '') as kod, count(*) as jumlah
        from m
        group by 1
      ) c on c.kod = coalesce(k.kod, '')
    ),

    'ikut_status_perkahwinan', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (
        values
          (1, 'bujang', 'Bujang'),
          (2, 'berkahwin', 'Berkahwin'),
          (3, 'pernah_berkahwin', 'Pernah Berkahwin'),
          (4, null, 'Tiada Rekod')
      ) as k(ord, kod, label)
      left join (
        select coalesce(status_perkahwinan, '') as kod, count(*) as jumlah
        from m
        group by 1
      ) c on c.kod = coalesce(k.kod, '')
    ),

    -- --- Negeri: ANGGARAN BEST-EFFORT daripada teks alamat (tidak berubah) --
    'ikut_negeri', (
      with corak_luar(negeri, teks) as (
        values
          ('Luar Negara', 'ARAB SAUDI'),
          ('Luar Negara', 'SAUDI ARABIA'),
          ('Luar Negara', 'MAKKAH'),
          ('Luar Negara', 'MADINAH'),
          ('Luar Negara', 'MECCA'),
          ('Luar Negara', 'MESIR'),
          ('Luar Negara', 'EGYPT'),
          ('Luar Negara', 'JORDAN'),
          ('Luar Negara', 'YORDAN'),
          ('Luar Negara', 'UNITED KINGDOM'),
          ('Luar Negara', 'ENGLAND'),
          ('Luar Negara', 'LONDON'),
          ('Luar Negara', 'AUSTRALIA'),
          ('Luar Negara', 'SINGAPURA'),
          ('Luar Negara', 'SINGAPORE'),
          ('Luar Negara', 'INDONESIA'),
          ('Luar Negara', 'AMERIKA SYARIKAT'),
          ('Luar Negara', 'UNITED STATES'),
          ('Luar Negara', 'IRELAND'),
          ('Luar Negara', 'GERMANY'),
          ('Luar Negara', 'JERMAN'),
          ('Luar Negara', 'JAPAN'),
          ('Luar Negara', 'JEPUN'),
          ('Luar Negara', 'KOREA'),
          ('Luar Negara', 'TAIWAN'),
          ('Luar Negara', 'CANADA'),
          ('Luar Negara', 'QATAR'),
          ('Luar Negara', 'KUWAIT'),
          ('Luar Negara', 'UAE'),
          ('Luar Negara', 'EMIRATES'),
          ('Luar Negara', 'DUBAI'),
          ('Luar Negara', 'ABU DHABI'),
          ('Luar Negara', 'NEW ZEALAND'),
          ('Luar Negara', 'TURKEY'),
          ('Luar Negara', 'TURKI')
      ),
      corak(negeri, teks) as (
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
            select cl.negeri
            from corak_luar cl
            where strpos(m.alamat, cl.teks) > 0
            order by strpos(reverse(m.alamat), reverse(cl.teks)), length(cl.teks) desc
            limit 1
          ),
          (
            select c.negeri
            from corak c
            where strpos(m.alamat, c.teks) > 0
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
