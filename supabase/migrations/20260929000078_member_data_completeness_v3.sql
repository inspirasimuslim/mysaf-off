-- =============================================================================
-- mysaf-off — Statistik Kelengkapan Data Ahli, versi 3 (kategori Pendidikan)
--
-- Jalankan SELEPAS 20260929000077_pendidikan_rombak.sql. Hanya kategori
-- Pendidikan berubah — lima kategori lain (Data Peribadi, Pekerjaan,
-- Perniagaan, Keluarga, Komitmen) KEKAL sama seperti
-- 20260929000075_member_data_completeness_v2.sql.
--
-- Bentuk output (`member_completeness_rows()`) TIDAK berubah — 6 lajur
-- boolean yang sama, jadi `create or replace` sah (bukan drop+create seperti
-- 075, yang OUT parameternya sendiri berubah).
--
-- Pendidikan baharu — Siap jika:
--   `sekolah_id` diisi, DAN
--   (senarai `member_education` kosong ATAU setiap baris lengkap: jurusan +
--    institusi terisi, dan `sumber_pembiayaan` terisi HANYA bila
--    status_pengajian = 'sedang_menjalani').
-- Senarai kosong dikira SIAP — ahli yang tidak pernah lanjut pengajian
-- selepas SPM bukan "tak lengkap data".
-- =============================================================================

create or replace function public.member_completeness_rows()
returns table (
  member_id   uuid,
  nombor_ahli text,
  full_name   text,
  generasi    text,
  data_peribadi boolean,
  pendidikan    boolean,
  pekerjaan     boolean,
  perniagaan    boolean,
  keluarga      boolean,
  komitmen      boolean,
  updated_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      m.*,
      (m.status_pekerjaan = 'bekerja')                             as working,
      (m.status_perkahwinan in ('berkahwin', 'pernah_berkahwin'))  as married
    from public.members m
    where not m.disekat
  ),
  bisnes as (
    select
      mb.member_id,
      bool_and(
        mb.mode is not null
        and array_length(mb.sub_kategori, 1) > 0
        and nullif(trim(mb.nama_perniagaan), '') is not null
        and mb.negeri_operasi is not null
        and mb.anggaran_pendapatan_range is not null
      ) as semua_lengkap
    from public.member_businesses mb
    group by mb.member_id
  ),
  pendidikan_entries as (
    select
      me.member_id,
      bool_and(
        nullif(trim(me.jurusan), '') is not null
        and nullif(trim(me.institusi), '') is not null
        and (me.status_pengajian <> 'sedang_menjalani' or me.sumber_pembiayaan is not null)
      ) as semua_lengkap
    from public.member_education me
    group by me.member_id
  )
  select
    b.id as member_id,
    b.nombor_ahli,
    b.full_name,
    b.generasi,

    -- --- 1. Data Peribadi: tidak berubah daripada v2 -----------------------
    (
      nullif(trim(b.jantina), '') is not null
      and nullif(trim(b.nric), '') is not null
      and nullif(trim(b.no_tel), '') is not null
      and nullif(trim(b.alamat), '') is not null
      and nullif(trim(b.alamat_semasa), '') is not null
      and nullif(trim(b.kawasan_usrah), '') is not null
    ) as data_peribadi,

    -- --- 2. Pendidikan (BAHARU v3): sekolah_id + senarai member_education --
    (
      b.sekolah_id is not null
      and (
        not exists (select 1 from pendidikan_entries x where x.member_id = b.id)
        or coalesce((select y.semua_lengkap from pendidikan_entries y where y.member_id = b.id), false)
      )
    ) as pendidikan,

    -- --- 3. Pekerjaan: status wajib; butiran hanya bila 'bekerja' -----------
    (
      b.status_pekerjaan is not null
      and (
        not b.working
        or (
          nullif(trim(b.sektor_pekerjaan), '') is not null
          and nullif(trim(b.jawatan_pekerjaan), '') is not null
          and nullif(trim(b.nama_majikan), '') is not null
          and b.negeri_tempat_kerja is not null
          and b.anggaran_pendapatan_range is not null
        )
      )
    ) as pekerjaan,

    -- --- 4. Perniagaan: siap jika tiada bisnes, atau semua lengkap ---------
    (
      not exists (select 1 from bisnes x where x.member_id = b.id)
      or coalesce((select y.semua_lengkap from bisnes y where y.member_id = b.id), false)
    ) as perniagaan,

    -- --- 5. Keluarga: bujang automatik siap; berkahwin/pernah perlu pasangan+anak(+sebab) --
    (
      b.status_perkahwinan is not null
      and (
        b.status_perkahwinan = 'bujang'
        or (
          (b.spouse_member_id is not null or nullif(trim(b.nama_pasangan), '') is not null)
          and b.bil_anak is not null
          and (b.status_perkahwinan <> 'pernah_berkahwin' or b.sebab_bercerai_kematian is not null)
        )
      )
    ) as keluarga,

    -- --- 6. Komitmen: dua suis berasingan -----------------------------------
    (
      (not b.jawatan_ikhwan_aktif or (nullif(trim(b.jawatan_ikhwan_1), '') is not null and nullif(trim(b.jawatan_ikhwan_2), '') is not null))
      and (not b.jawatan_pas_aktif or (
        nullif(trim(b.jawatan_pas_1), '') is not null
        and nullif(trim(b.jawatan_pas_2), '') is not null
        and nullif(trim(b.no_keahlian_pas), '') is not null
      ))
    ) as komitmen,

    b.updated_at
  from base b;
$$;

revoke all on function public.member_completeness_rows() from public, anon, authenticated;

notify pgrst, 'reload schema';
