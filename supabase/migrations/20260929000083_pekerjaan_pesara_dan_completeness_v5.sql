-- =============================================================================
-- mysaf-off — Pekerjaan: kolum `bidang_pekerjaan_lama` + kelengkapan v5
--
-- Jalankan SELEPAS 20260929000082_pekerjaan_pesara_backup.sql.
--   1. `members.bidang_pekerjaan_lama` (teks bebas, nullable) — untuk Pesara.
--      TIDAK wajib dalam kelengkapan (data lama/opsyenal).
--   2. `member_completeness_rows()` — cabang 'sendiri' disemak semula: bidang
--      (`bidang_kerja_sendiri_lain_teks`) kini teks "Bidang" sentiasa
--      dipaparkan (bukan hanya bila lain_lain); jika ada perniagaan -> siap,
--      jika tidak -> jenis + bidang + negeri + pendapatan wajib (jawatan &
--      majikan tidak). Bentuk output tidak berubah -> `create or replace`.
--   3. `members_full_export()` — tambah kolum baharu (drop+create).
-- =============================================================================

alter table public.members add column if not exists bidang_pekerjaan_lama text;


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

    -- --- 3. Pekerjaan (v5): status wajib; butiran hanya bila 'bekerja' ------
    -- 'sendiri' + ada perniagaan -> siap (semua butiran di tab Perniagaan).
    -- 'sendiri' tanpa perniagaan -> jenis + bidang (teks) + negeri + pendapatan;
    --   jawatan/majikan TIDAK wajib. 'pesara' -> bidang_pekerjaan_lama TIDAK wajib.
    (
      b.status_pekerjaan is not null
      and (
        not b.working
        or (
          nullif(trim(b.sektor_pekerjaan), '') is not null
          and (
            case b.sektor_pekerjaan
              when 'kerajaan' then
                nullif(trim(b.jawatan_pekerjaan), '') is not null
                and nullif(trim(b.nama_majikan), '') is not null
                and b.negeri_tempat_kerja is not null
                and b.anggaran_pendapatan_range is not null
                and b.bidang_kerajaan is not null
                and (b.bidang_kerajaan <> 'lain_lain' or nullif(trim(b.bidang_kerajaan_lain_teks), '') is not null)
              when 'swasta' then
                nullif(trim(b.jawatan_pekerjaan), '') is not null
                and nullif(trim(b.nama_majikan), '') is not null
                and b.negeri_tempat_kerja is not null
                and b.anggaran_pendapatan_range is not null
                and b.kumpulan_bidang_swasta is not null
                and b.bidang_khusus_swasta is not null
                and (b.bidang_khusus_swasta <> 'lain_lain' or nullif(trim(b.bidang_khusus_swasta_lain_teks), '') is not null)
              when 'glc' then
                nullif(trim(b.jawatan_pekerjaan), '') is not null
                and nullif(trim(b.nama_majikan), '') is not null
                and b.negeri_tempat_kerja is not null
                and b.anggaran_pendapatan_range is not null
                and b.kumpulan_bidang_swasta is not null
                and b.bidang_khusus_swasta is not null
                and (b.bidang_khusus_swasta <> 'lain_lain' or nullif(trim(b.bidang_khusus_swasta_lain_teks), '') is not null)
              when 'sendiri' then
                exists (select 1 from public.member_businesses x where x.member_id = b.id)
                or (
                  b.jenis_kerja_sendiri is not null
                  and nullif(trim(b.bidang_kerja_sendiri_lain_teks), '') is not null
                  and b.negeri_tempat_kerja is not null
                  and b.anggaran_pendapatan_range is not null
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


-- members_full_export
drop function if exists public.members_full_export();

create function public.members_full_export()
returns table (
  nombor_ahli             text,
  generasi                text,
  full_name               text,
  jantina                 text,
  nric                    text,
  email                   text,
  no_tel                  text,
  alamat                  text,
  alamat_semasa           text,
  kawasan_usrah           text,
  disekat                 boolean,
  jawatan_ikhwan_1        text,
  jawatan_ikhwan_2        text,
  jawatan_ikhwan_aktif    boolean,
  jawatan_pas_1           text,
  jawatan_pas_2           text,
  no_keahlian_pas         text,
  jawatan_pas_aktif       boolean,
  sekolah                 text,
  status_pekerjaan        text,
  sektor_pekerjaan        text,
  bidang_kerajaan                text,
  bidang_kerajaan_lain_teks      text,
  kumpulan_bidang_swasta         text,
  bidang_khusus_swasta           text,
  bidang_khusus_swasta_lain_teks text,
  jenis_kerja_sendiri            text,
  bidang_kerja_sendiri_lain_teks text,
  bidang_pekerjaan_lama          text,
  jawatan_pekerjaan       text,
  nama_majikan            text,
  negeri_tempat_kerja     text,
  anggaran_pendapatan_range text,
  status_perkahwinan      text,
  nama_pasangan           text,
  tahun_berkahwin         text,
  bil_anak                integer,
  sebab_bercerai_kematian text,
  self_updated_at         timestamptz,
  created_at              timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
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
    m.jawatan_ikhwan_aktif,
    m.jawatan_pas_1,
    m.jawatan_pas_2,
    m.no_keahlian_pas,
    m.jawatan_pas_aktif,
    s.nama as sekolah,
    m.status_pekerjaan,
    m.sektor_pekerjaan,
    m.bidang_kerajaan,
    m.bidang_kerajaan_lain_teks,
    m.kumpulan_bidang_swasta,
    m.bidang_khusus_swasta,
    m.bidang_khusus_swasta_lain_teks,
    m.jenis_kerja_sendiri,
    m.bidang_kerja_sendiri_lain_teks,
    m.bidang_pekerjaan_lama,
    m.jawatan_pekerjaan,
    m.nama_majikan,
    m.negeri_tempat_kerja,
    m.anggaran_pendapatan_range,
    m.status_perkahwinan,
    m.nama_pasangan,
    m.tahun_berkahwin,
    m.bil_anak,
    m.sebab_bercerai_kematian,
    m.self_updated_at,
    m.created_at
  from public.members m
  left join public.schools s on s.id = m.sekolah_id
  order by m.nombor_ahli nulls last, m.full_name;
end;
$$;

revoke all on function public.members_full_export() from public, anon;
grant execute on function public.members_full_export() to authenticated;

notify pgrst, 'reload schema';
