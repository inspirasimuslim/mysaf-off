-- =============================================================================
-- mysaf-off — Statistik Kelengkapan Data Ahli, versi 4 (kategori Pekerjaan)
--
-- Jalankan SELEPAS 20260929000080_pekerjaan_rombak.sql. Hanya kategori
-- Pekerjaan berubah — lima kategori lain KEKAL sama seperti v3 (078).
--
-- Bentuk output (`member_completeness_rows()`) TIDAK berubah — 6 lajur
-- boolean yang sama, jadi `create or replace` sah (drop+create tidak
-- diperlukan; `member_data_completeness_summary()`/`_export()` juga tidak
-- perlu disentuh).
--
-- Pekerjaan baharu — Siap jika `status_pekerjaan` diisi DAN, bila 'bekerja':
--   sektor + negeri + pendapatan diisi (jawatan + majikan juga, KECUALI sektor
--   'sendiri' — tak relevan untuk gig/freelance), DAN bidang
--   mengikut sektor:
--     kerajaan     -> bidang_kerajaan (+ teks jika 'lain_lain')
--     swasta / glc -> kumpulan_bidang_swasta + bidang_khusus_swasta
--                     (+ teks jika 'lain_lain')
--     sendiri      -> SIAP jika ahli ada baris `member_businesses` (bidang
--                     dilengkapkan di tab Perniagaan), ATAU jenis_kerja_sendiri
--                     (+ teks jika 'lain_lain')
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
          and (b.sektor_pekerjaan = 'sendiri' or nullif(trim(b.jawatan_pekerjaan), '') is not null)
          and (b.sektor_pekerjaan = 'sendiri' or nullif(trim(b.nama_majikan), '') is not null)
          and b.negeri_tempat_kerja is not null
          and b.anggaran_pendapatan_range is not null
          and (
            case b.sektor_pekerjaan
              when 'kerajaan' then
                b.bidang_kerajaan is not null
                and (b.bidang_kerajaan <> 'lain_lain' or nullif(trim(b.bidang_kerajaan_lain_teks), '') is not null)
              when 'swasta' then
                b.kumpulan_bidang_swasta is not null
                and b.bidang_khusus_swasta is not null
                and (b.bidang_khusus_swasta <> 'lain_lain' or nullif(trim(b.bidang_khusus_swasta_lain_teks), '') is not null)
              when 'glc' then
                b.kumpulan_bidang_swasta is not null
                and b.bidang_khusus_swasta is not null
                and (b.bidang_khusus_swasta <> 'lain_lain' or nullif(trim(b.bidang_khusus_swasta_lain_teks), '') is not null)
              when 'sendiri' then
                exists (select 1 from public.member_businesses x where x.member_id = b.id)
                or (
                  b.jenis_kerja_sendiri is not null
                  and (b.jenis_kerja_sendiri <> 'lain_lain' or nullif(trim(b.bidang_kerja_sendiri_lain_teks), '') is not null)
                )
              else false
            end
          )
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
