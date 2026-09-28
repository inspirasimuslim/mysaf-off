# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Statistik Kelengkapan Data Ahli — rekod keputusan (2026-09-29)

Rujukan penuh: `supabase/migrations/20260929000072_member_data_completeness.sql`,
`lib/member-completeness.ts`, `lib/member-completeness-report.ts`,
`app/(app)/admin/statistik-kelengkapan-data.tsx`.

Lima kategori. Seorang ahli "Siap" untuk satu kategori hanya bila SEMUA medan
RELEVAN diisi — medan bersyarat yang tidak relevan pada status semasa ahli itu
TIDAK dikira (elak salah kira ahli lama sebagai "tak lengkap" untuk medan yang
memang tak berkenaan dengannya). Peratus keseluruhan = (kategori siap ÷ 5) ×
100%, jadi sentiasa gandaan 20%.

1. **Data Peribadi** — `jantina`, `nric`, `no_tel`, `alamat`, `alamat_semasa`,
   `kawasan_usrah`. Semua wajib, tiada syarat.
2. **Pendidikan** — asas (`tahap_pendidikan`, `status_pengajian`, `sekolah`)
   + institusi (`nama_institusi`, `alamat_institusi`, `tahun_pengajian`,
   `jurusan_pengajian`, `sumber_pembiayaan`) HANYA bila `status_pengajian`
   sedang/sudah belajar.
3. **Pekerjaan** — `status_pekerjaan` + butiran (`nama_majikan`,
   `alamat_tempat_kerja`, `anggaran_pendapatan_range`, dan `sektor_pekerjaan`/
   `jawatan_pekerjaan` bila bekerja, atau `jenis_perniagaan` bila berniaga)
   HANYA bila status menunjukkan bekerja/berniaga.
4. **Keluarga** — asas isi rumah/ibu bapa (`anggaran_pendapatan_isi_rumah_range`,
   `bil_tanggungan_selain_keluarga`, `pekerjaan_ibu`, `pekerjaan_bapa`,
   `bil_tanggungan_ibu_bapa`) WAJIB untuk SEMUA ahli tanpa mengira status
   kahwin, + `tahun_berkahwin`/`bil_anak`/pasangan (`spouse_member_id` jika
   MBM, `nama_pasangan` jika bukan MBM) HANYA bila berkahwin. `bil_anak = 0`
   dikira TERISI (bukan tak lengkap) — hanya NULL dikira belum jawab.
5. **Jawatan** — sekurang-kurangnya satu daripada `jawatan_ikhwan_1-3` /
   `jawatan_pas_1-3` / `no_keahlian_pas` diisi, ATAU kolum
   `jawatan_disahkan_tiada` (boolean, lalai `false`) ditanda `true` melalui
   suis "Tiada Jawatan" dalam tab Jawatan (`member-form.tsx`). Lalai `false`
   sengaja TIDAK ditanda retroaktif untuk ahli sedia ada — beza "belum sempat
   isi" daripada "memang tiada jawatan" mesti disahkan sendiri oleh ahli/admin.

**Dikecualikan terus** (sentiasa penuh atau elaborasi bebas, tiada dalam
mana-mana kategori): `full_name`, `generasi`, `email`, `nombor_ahli` (wajib
semasa daftar / auto-generate), `pembiayaan_lain`, `nama_anak`.

**Ahli yang dikira**: hanya `not disekat` ("ahli aktif") — ahli disekat
dikecualikan daripada agregat dan eksport.

**Kebenaran**: kedua-dua RPC (`member_data_completeness_summary`,
`member_data_completeness_export`) guna `can_view_members()` sedia ada
(department JABATAN DATA & SUMBER MANUSIA, `can_view` cukup — tidak perlu
`can_edit`), sama seperti `members_full_export()`. Logik lima kategori
dikongsi melalui `member_completeness_rows()` — fungsi dalaman, TIDAK
di-grant kepada `authenticated`, hanya boleh dipanggil dari dalam RPC
`security definer` lain.

**Muat naik Excel (`ahli-upload`)**: `jawatan_disahkan_tiada` bukan lajur
dalam fail Excel — sama seperti `spouse_member_id`/`nama_anak`, muat naik
semula (upsert ikut `nombor_ahli`) akan menetapkannya semula ke `false`.
Ini konsisten dengan tingkah laku sedia ada fail Excel = sumber kebenaran
penuh semasa muat naik pukal, bukan kemas kini separa.

**Nota infra**: sejarah migration CLI (`supabase_migrations.schema_migrations`)
sebelum ini hanya merekodkan `20260906000001`–`20260906000008` — migration
`20260907000009` hingga `20260929000071` telah live di production tetapi
tidak direkod (dulu ditampal manual ke SQL Editor sebelum CLI berfungsi
penuh). Dibaiki 2026-09-29 dengan `supabase migration repair --status
applied <63 versi> --linked` (bookkeeping sahaja, tiada SQL lama dijalankan
semula) supaya `supabase db push --linked` betul-betul selektif sejak itu.
