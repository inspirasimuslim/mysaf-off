-- =============================================================================
-- mysaf-off — Pembetulan audit eksport
--
-- Jalankan SELEPAS 20260916000047_usrah_attendance_detail.sql. Idempotent.
--
-- Audit eksport mendapati data yang WUJUD dalam pangkalan data tetapi tidak
-- pernah keluar dalam fail Excel. Migration ini membetulkan lima perkara:
--
--   1. `usrah_year_report` menggugurkan ahli yang belum berekod pada tahun itu
--      (inner join). Ahli baharu hilang sepenuhnya dari laporan dan bukan
--      muncul sebagai sifar hadir — senarai yang nampak lengkap sedangkan
--      tidak.
--   2. Kolum butiran kehadiran (kawasan, lokasi, tarikh, sumber, direkod oleh)
--      tidak pernah dipulangkan kepada laporan tahunan.
--   3. `event_attendance_export` menyembunyikan `distance_meters` — satu-satunya
--      bukti bahawa kehadiran "bersemuka" benar-benar berlaku di lokasi.
--   4. Laporan yuran dan PIPIS mengagregat `status = 'success'` sahaja, jadi
--      bayaran gateway yang gagal atau tersangkut tidak kelihatan di mana-mana.
--      Dua RPC transaksi baharu memulangkan SETIAP baris, setiap status.
--   5. `members_full_export` tidak memulangkan `self_updated_at` dan
--      `created_at`.
-- =============================================================================


-- =============================================================================
-- 1 + 2. Laporan tahunan usrah: left join, dan butiran kehadiran
--
-- Bentuk pulangan berubah (12 kolum bulan → 12 kolum bulan + 5 kolum butiran),
-- jadi fungsi lama perlu digugurkan dahulu: `create or replace` tidak boleh
-- menukar jenis pulangan.
--
-- Satu baris setiap ahli setiap BULAN, bukan satu baris setiap ahli. Grid 12
-- bulan dibina semula di app daripada baris-baris ini — butiran kawasan dan
-- tarikh tidak muat dalam satu sel grid, dan meratakannya di pelayan bermakna
-- memilih satu bentuk sahaja untuk kedua-dua helaian fail.
-- =============================================================================

drop function if exists public.usrah_year_report(integer);

create function public.usrah_year_report(target_year integer)
returns table (
  nombor_ahli       text,
  full_name         text,
  generasi          text,
  month             integer,
  attended          boolean,
  attendance_source text,
  kawasan_attended  text,
  location_text     text,
  attended_date     date,
  recorded_by       text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  /*
    `left join` dan bukan `join`: ahli yang didaftar selepas baris tahun itu
    dijana tiada satu pun baris kehadiran, dan inner join akan menggugurkannya
    daripada laporan. Ahli begitu patut muncul dengan kehadiran kosong — nama
    yang hilang daripada senarai tidak akan disedari sesiapa, tetapi baris
    kosong akan.
  */
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
    a.month,
    a.attended,
    a.attendance_source,
    a.kawasan_attended,
    a.location_text,
    a.attended_date,
    a.recorded_by
  from public.members m
  left join public.usrah_monthly_attendance a
    on a.member_id = m.id
   and a.year = target_year
  where public.can_view_usrah()
  order by m.nombor_ahli nulls last, m.full_name, a.month;
$$;

revoke all on function public.usrah_year_report(integer) from public, anon;
grant execute on function public.usrah_year_report(integer) to authenticated;


-- =============================================================================
-- 3. Kehadiran acara: jarak dari pin lokasi
--
-- `distance_meters` kosong bagi acara tanpa pin dan bagi kehadiran online —
-- app memaparkannya sebagai '-'. Latitud dan longitud kekal TIDAK dieksport:
-- jarak sudah menjawab soalan "adakah dia di sana", manakala koordinat mentah
-- ialah lokasi peribadi seseorang pada satu masa tertentu.
-- =============================================================================

drop function if exists public.event_attendance_export(uuid);

create function public.event_attendance_export(p_event_id uuid)
returns table (
  nombor_ahli      text,
  full_name        text,
  generasi         text,
  scanned_at       timestamptz,
  method           text,
  attendance_mode  text,
  distance_meters  numeric
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
    s.scanned_at,
    s.method,
    s.attendance_mode,
    s.distance_meters
  from public.usrah_attendance_scans s
  join public.members m on m.id = s.member_id
  join public.usrah_events e on e.id = s.event_id
  where s.event_id = p_event_id
    and public.can_view_event(e.event_type)
  order by s.scanned_at;
$$;

revoke all on function public.event_attendance_export(uuid) from public, anon;
grant execute on function public.event_attendance_export(uuid) to authenticated;


-- =============================================================================
-- 4. Transaksi yuran dan PIPIS — SETIAP baris, SETIAP status
--
-- Laporan agregat sedia ada (`yuran_year_report`, `pipis_full_report`) sengaja
-- mengira `status = 'success'` sahaja: baki seseorang tidak patut bergerak
-- kerana bayaran yang gagal. Tetapi itu bermakna bayaran ToyyibPay yang gagal
-- atau tersangkut pada 'pending' tidak muncul dalam SATU pun fail — dan bayaran
-- tersangkut itulah yang perlu dikejar.
--
-- Dua fungsi ini menjawab soalan yang berbeza daripada laporan agregat, jadi
-- ia ditambah di sebelahnya dan bukan menggantikannya.
-- =============================================================================

create or replace function public.yuran_transactions_export(p_year integer default null)
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
    p.created_at,
    p.amount,
    p.requested_amount,
    p.method,
    p.status,
    p.gateway_bill_code,
    p.note
  from public.yuran_payments p
  join public.members m on m.id = p.member_id
  where public.can_view_yuran()
    -- `p_year` null = seluruh sejarah; bayaran tersangkut tidak semestinya
    -- berada dalam tahun yang sedang dilihat.
    and (p_year is null or p.year = p_year)
  order by p.created_at desc;
$$;

revoke all on function public.yuran_transactions_export(integer) from public, anon;
grant execute on function public.yuran_transactions_export(integer) to authenticated;


create or replace function public.pipis_transactions_export()
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
    c.note
  from public.pipis_contributions c
  join public.members m on m.id = c.member_id
  where public.can_view_pipis()
  order by c.created_at desc;
$$;

revoke all on function public.pipis_transactions_export() from public, anon;
grant execute on function public.pipis_transactions_export() to authenticated;


-- =============================================================================
-- 5. Eksport ahli: bila ahli sendiri mengemas kini, dan bila dia didaftar
--
-- `self_updated_at` ialah satu-satunya petunjuk sama ada ahli pernah menyentuh
-- profilnya sendiri — tanpanya tiada cara mengetahui siapa yang perlu dikejar
-- untuk mengesahkan data. `created_at` membezakan ahli baharu daripada rekod
-- yang diimport pada hari pertama.
--
-- `must_change_password` dan `temp_password_expires_at` kekal TIDAK dieksport:
-- itu keadaan akaun, bukan data keahlian.
-- =============================================================================

drop function if exists public.members_full_export();

create function public.members_full_export()
returns table (
  nombor_ahli                         text,
  generasi                            text,
  full_name                           text,
  jantina                             text,
  nric                                text,
  email                               text,
  no_tel                              text,
  alamat                              text,
  alamat_semasa                       text,
  kawasan_usrah                       text,
  disekat                             boolean,
  jawatan_ikhwan_1                    text,
  jawatan_ikhwan_2                    text,
  jawatan_ikhwan_3                    text,
  jawatan_pas_1                       text,
  jawatan_pas_2                       text,
  jawatan_pas_3                       text,
  no_keahlian_pas                     text,
  tahap_pendidikan                    text,
  status_pengajian                    text,
  sekolah                             text,
  nama_institusi                      text,
  alamat_institusi                    text,
  tahun_pengajian                     text,
  jurusan_pengajian                   text,
  sumber_pembiayaan                   text,
  pembiayaan_lain                     text,
  status_pekerjaan                    text,
  sektor_pekerjaan                    text,
  jawatan_pekerjaan                   text,
  nama_majikan                        text,
  alamat_tempat_kerja                 text,
  anggaran_pendapatan_range           text,
  jenis_perniagaan                    text,
  status_perkahwinan                  text,
  nama_pasangan                       text,
  tahun_berkahwin                     text,
  bil_anak                            integer,
  anggaran_pendapatan_isi_rumah_range text,
  bil_tanggungan_selain_keluarga      integer,
  pekerjaan_ibu                       text,
  pekerjaan_bapa                      text,
  bil_tanggungan_ibu_bapa             integer,
  self_updated_at                     timestamptz,
  created_at                          timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  /*
    `can_view_members()` sudah merangkumi Super Admin, semakan sekatan akaun dan
    kunci kata laluan sementara (lihat `has_department_access`). Semakan dibuat
    DI SINI dan bukan diserahkan kepada RLS: `security definer` memintas RLS,
    jadi tanpa baris ini sesiapa yang log masuk boleh memanggilnya.
  */
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Eksport data ahli memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  return query
  select
    m.nombor_ahli,
    m.generasi,
    m.full_name,
    m.jantina,
    m.nric,
    m.email,
    m.no_tel,
    m.alamat,
    m.alamat_semasa,
    m.kawasan_usrah,
    m.disekat,
    m.jawatan_ikhwan_1,
    m.jawatan_ikhwan_2,
    m.jawatan_ikhwan_3,
    m.jawatan_pas_1,
    m.jawatan_pas_2,
    m.jawatan_pas_3,
    m.no_keahlian_pas,
    m.tahap_pendidikan,
    m.status_pengajian,
    m.sekolah,
    m.nama_institusi,
    m.alamat_institusi,
    m.tahun_pengajian,
    m.jurusan_pengajian,
    m.sumber_pembiayaan,
    m.pembiayaan_lain,
    m.status_pekerjaan,
    m.sektor_pekerjaan,
    m.jawatan_pekerjaan,
    m.nama_majikan,
    m.alamat_tempat_kerja,
    m.anggaran_pendapatan_range,
    m.jenis_perniagaan,
    m.status_perkahwinan,
    m.nama_pasangan,
    m.tahun_berkahwin,
    m.bil_anak,
    m.anggaran_pendapatan_isi_rumah_range,
    m.bil_tanggungan_selain_keluarga,
    m.pekerjaan_ibu,
    m.pekerjaan_bapa,
    m.bil_tanggungan_ibu_bapa,
    m.self_updated_at,
    m.created_at
  from public.members m
  order by m.nombor_ahli nulls last, m.full_name;
end;
$$;

revoke all on function public.members_full_export() from public, anon;
grant execute on function public.members_full_export() to authenticated;

notify pgrst, 'reload schema';
