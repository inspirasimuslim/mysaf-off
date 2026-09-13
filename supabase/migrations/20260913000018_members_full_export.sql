-- =============================================================================
-- mysaf-off — Eksport penuh data ahli
--
-- Jalankan SELEPAS 20260913000017_security_hardening.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Satu fungsi yang memulangkan SETIAP kolum data ahli bagi SEMUA ahli, untuk
-- fail Excel yang boleh disunting dan dimuat naik semula.
--
-- Admin JABATAN DATA & SUMBER MANUSIA sudah boleh membaca `members` terus
-- melalui RLS, jadi fungsi ini tidak membuka apa-apa yang baharu. Ia wujud
-- supaya eksport mempunyai SATU pintu dengan senarai kolum yang ditulis satu
-- per satu — kolum baharu yang ditambah pada `members` kelak tidak masuk ke
-- dalam fail yang diedarkan tanpa seseorang memutuskannya di sini.
--
-- Yang TIADA: `id`, `user_id` (pautan akaun), `avatar_url`, dan tanda kata
-- laluan sementara. Tiada satu pun daripadanya ada dalam fail keahlian asal,
-- dan tiada satu pun patut disunting melalui Excel.
-- =============================================================================

create or replace function public.members_full_export()
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
  bil_anak                            int,
  anggaran_pendapatan_isi_rumah_range text,
  bil_tanggungan_selain_keluarga      int,
  pekerjaan_ibu                       text,
  pekerjaan_bapa                      text,
  bil_tanggungan_ibu_bapa             int
)
language plpgsql
stable
security definer
set search_path = public
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
    m.bil_tanggungan_ibu_bapa
  from public.members m
  order by m.nombor_ahli nulls last, m.full_name;
end;
$$;

revoke all on function public.members_full_export() from public, anon;
grant execute on function public.members_full_export() to authenticated;

notify pgrst, 'reload schema';
