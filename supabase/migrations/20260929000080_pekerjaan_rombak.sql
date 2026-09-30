-- =============================================================================
-- mysaf-off — Rombak tab Pekerjaan (borang ahli)
--
-- Jalankan SELEPAS 20260929000079_pekerjaan_rombak_backup.sql. Ikut corak
-- rombak Pendidikan (077): kolum baharu ditambah kosong, data lama TIDAK
-- dimigrasi kecuali pemetaan nama yang diarahkan eksplisit.
--
-- Perubahan:
--   1. `sektor_pekerjaan`: 3 nilai -> 4 (kerajaan/swasta/glc/sendiri).
--      `separuh_kerajaan_glc` dipetakan ke `glc`; kerajaan/swasta kekal.
--   2. 7 kolum baharu pada `members` untuk dropdown Bidang (cascade dari sektor).
--   3. `anggaran_pendapatan_range`: '10000+' dipecah kepada '10000-14999',
--      '15000-19999', '20000+' — pada `members` DAN `member_businesses`
--      (kedua-duanya berkongsi satu senarai pilihan dalam aplikasi). Nilai
--      '10000+' lama tidak boleh dipetakan dengan selamat ke satu bracket
--      baharu, jadi di-NULL-kan (isi semula).
--
-- Medan Pekerjaan LAIN pada `members` tidak wujud selain lima yang KEKAL
-- (status_pekerjaan, jawatan_pekerjaan, nama_majikan, negeri_tempat_kerja,
-- sektor_pekerjaan) + anggaran_pendapatan_range — `alamat_tempat_kerja` sudah
-- dibuang oleh 074. Tiada kolum yang perlu di-drop dalam rombak ini.
-- =============================================================================


-- =============================================================================
-- 1. sektor_pekerjaan: 3 nilai -> 4 nilai
-- =============================================================================

alter table public.members drop constraint if exists members_sektor_pekerjaan_check;

update public.members
set sektor_pekerjaan = 'glc'
where sektor_pekerjaan = 'separuh_kerajaan_glc';

alter table public.members add constraint members_sektor_pekerjaan_check check (
  sektor_pekerjaan is null or sektor_pekerjaan in ('kerajaan', 'swasta', 'glc', 'sendiri')
);


-- =============================================================================
-- 2. Kolum Bidang baharu (semua nullable, tiada data lama)
-- =============================================================================

alter table public.members
  add column if not exists bidang_kerajaan                text,
  add column if not exists bidang_kerajaan_lain_teks      text,
  add column if not exists kumpulan_bidang_swasta         text,
  add column if not exists bidang_khusus_swasta           text,
  add column if not exists bidang_khusus_swasta_lain_teks text,
  add column if not exists jenis_kerja_sendiri            text,
  add column if not exists bidang_kerja_sendiri_lain_teks text;

alter table public.members drop constraint if exists members_bidang_kerajaan_check;
alter table public.members add constraint members_bidang_kerajaan_check check (
  bidang_kerajaan is null or bidang_kerajaan in (
    'pentadbiran', 'pendidikan', 'kesihatan', 'kejuruteraan', 'teknologi_maklumat', 'kewangan',
    'perundangan', 'keselamatan', 'penguatkuasaan', 'pertanian_perikanan', 'sains_penyelidikan',
    'kebajikan_sosial', 'agama', 'media_kebudayaan', 'kemahiran_sokongan', 'lain_lain'
  )
);

alter table public.members drop constraint if exists members_kumpulan_bidang_swasta_check;
alter table public.members add constraint members_kumpulan_bidang_swasta_check check (
  kumpulan_bidang_swasta is null or kumpulan_bidang_swasta in (
    'perkhidmatan_perdagangan', 'perindustrian_sumber_asli', 'profesional_pengurusan',
    'kreatif_media', 'kemahiran_tvet'
  )
);

-- Nilai unik merentas kumpulan (kecuali 'lain_lain' yang sama di hujung setiap
-- kumpulan), jadi satu senarai gabungan cukup; padanan kumpulan<->bidang
-- dikawal UI (dropdown cascade).
alter table public.members drop constraint if exists members_bidang_khusus_swasta_check;
alter table public.members add constraint members_bidang_khusus_swasta_check check (
  bidang_khusus_swasta is null or bidang_khusus_swasta in (
    'peruncitan_perdagangan', 'logistik_pengangkutan', 'pelancongan_hospitaliti', 'makanan_minuman_fnb',
    'hartanah', 'automotif_servis', 'keselamatan', 'sukan_kecergasan', 'warga_emas_penjagaan',
    'pendidikan_swasta', 'kesihatan_swasta', 'kebajikan_sosial_ngo', 'agama_swasta', 'penguatkuasaan_swasta',
    'pembuatan', 'minyak_gas_tenaga', 'perladangan_agrikultur', 'perikanan_akuakultur', 'penternakan',
    'perlombongan_kuari', 'ekonomi_hijau_esg',
    'perundangan', 'kejuruteraan', 'seni_bina_perancangan_bandar', 'sumber_manusia_perundingan',
    'pemasaran_pengiklanan', 'pentadbiran', 'teknologi_maklumat', 'kewangan', 'sains_penyelidikan',
    'media_penyiaran', 'industri_kreatif', 'pencipta_kandungan', 'fesyen_kraf', 'kebudayaan',
    'pertukangan', 'kecantikan_dandanan', 'pembaikan', 'penyelenggaraan',
    'lain_lain'
  )
);

alter table public.members drop constraint if exists members_jenis_kerja_sendiri_check;
alter table public.members add constraint members_jenis_kerja_sendiri_check check (
  jenis_kerja_sendiri is null or jenis_kerja_sendiri in ('pekerja_gig', 'freelance', 'lain_lain')
);


-- =============================================================================
-- 3. anggaran_pendapatan_range: pecah '10000+' (members + member_businesses)
--
-- Nama constraint inline auto-jana Postgres tidak dijamin, jadi dicari
-- melalui definisi dan bukan nama.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.members'::regclass, 'public.member_businesses'::regclass)
      and pg_get_constraintdef(c.oid) like '%anggaran_pendapatan_range%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

update public.members set anggaran_pendapatan_range = null where anggaran_pendapatan_range = '10000+';
update public.member_businesses set anggaran_pendapatan_range = null where anggaran_pendapatan_range = '10000+';

alter table public.members add constraint members_anggaran_pendapatan_range_check check (
  anggaran_pendapatan_range is null or anggaran_pendapatan_range in (
    '<1000', '1000-2999', '3000-4999', '5000-9999', '10000-14999', '15000-19999', '20000+'
  )
);

alter table public.member_businesses add constraint member_businesses_anggaran_pendapatan_range_check check (
  anggaran_pendapatan_range is null or anggaran_pendapatan_range in (
    '<1000', '1000-2999', '3000-4999', '5000-9999', '10000-14999', '15000-19999', '20000+'
  )
);


-- =============================================================================
-- 4. members_full_export() — tambah 7 kolum Bidang baharu
--
-- Bentuk output berubah, jadi drop+create (bukan create or replace). Selain 7
-- kolum baharu selepas sektor_pekerjaan, badan fungsi sama seperti 077.
-- Fail Excel (lib/member-sheet.ts) TIDAK memaparkan kolum baharu ini — bentuk
-- fail tidak berubah, sama corak `negeri_tempat_kerja`.
-- =============================================================================

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
