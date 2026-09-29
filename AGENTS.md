# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Borang Ahli — 6 Tab + Statistik Kelengkapan Data — rekod keputusan (2026-09-29)

Rujukan penuh: `supabase/migrations/20260929000073_member_rombak_backup.sql`,
`20260929000074_member_form_rombak.sql`, `20260929000075_member_data_completeness_v2.sql`,
`components/member-form.tsx`, `lib/member-businesses.ts`, `lib/member-completeness.ts`,
`lib/member-completeness-report.ts`, `app/(app)/admin/statistik-kelengkapan-data.tsx`.

Rombak besar sama hari — struktur borang ahli tukar daripada 5 tab kepada 6
tab (Peribadi/Pendidikan/Pekerjaan/Perniagaan/Keluarga/Komitmen), dan Dashboard
Statistik Kelengkapan Data (dibina sejam sebelumnya, versi 5-kategori) tukar
serentak kepada 6 kategori. **Versi 5-kategori (`...072`) sudah digantikan —
jangan rujuk ia untuk logik semasa**, kekal dalam sejarah migration sahaja.

## Struktur 6 tab borang (`member-form.tsx`)

1. **Peribadi** — tidak berubah (medan sama, cuma nama tab ditukar daripada
   "Maklumat Diri").
2. **Pendidikan** — tidak berubah.
3. **Pekerjaan** — suis "Sudah Bekerja" diderivasi daripada
   `status_pekerjaan === 'bekerja'` (BUKAN kolum berasingan). ON: `sektor_pekerjaan`
   (chip 3-pilihan: `kerajaan`/`swasta`/`separuh_kerajaan_glc`), `jawatan_pekerjaan`,
   `nama_majikan`, `negeri_tempat_kerja` (dropdown 16 negeri, GANTI
   `alamat_tempat_kerja` yang dibuang), `anggaran_pendapatan_range` (letak
   akhir, nota "Untuk rekod dalaman persatuan sahaja"). OFF: dropdown 3
   pilihan (`suri_rumah`/`tidak_bekerja`/`pesara`).
4. **Perniagaan** (BAHARU) — table berasingan `member_businesses` (bukan
   kolum flat), satu ahli boleh ada BANYAK baris. Toggle "Ada Perniagaan"
   DIDERIVASI daripada `businesses.length > 0` (bukan kolum). Setiap baris:
   `mode` (online/offline/kedua_dua), `sub_kategori` (`text[]`, multi-select,
   disempitkan ikut mode), `nama_perniagaan`, `negeri_operasi`,
   `anggaran_pendapatan_range` (berasingan daripada Pekerjaan). RLS mirror
   `yuran_ledger`/`pipis_contributions`: pemilik sendiri (`my_member_id()`)
   ATAU `can_view_members()`/`can_edit_members()` sedia ada — tiada fungsi
   kebenaran baharu. Disimpan melalui `lib/member-businesses.ts`
   (`saveMemberBusinesses` mendiff draf terhadap baris asal — insert/update/
   delete terus, TIADA RPC pembalut).
5. **Keluarga** — SEMUA medan ibu bapa/isi rumah lama DIBUANG kekal
   (`pekerjaan_ibu`, `pekerjaan_bapa`, `bil_tanggungan_ibu_bapa`,
   `anggaran_pendapatan_isi_rumah_range`, `bil_tanggungan_selain_keluarga`).
   `status_perkahwinan` kini 3 nilai (`bujang`/`berkahwin`/`pernah_berkahwin`,
   GANTI `berkahwin_mbm`/`berkahwin_bukan_mbm` lama). Pasangan MBM vs Bukan
   MBM BUKAN lagi encoded dalam enum — ia UI-only, ditentukan medan mana
   (`spouse_member_id` atau `nama_pasangan`) yang terisi. `pernah_berkahwin`
   tambah medan baharu `sebab_bercerai_kematian`
   (`bercerai`/`kematian_pasangan`). `bil_anak = 0` kekal dikira TERISI.
6. **Komitmen** (GANTI nama "Jawatan") — DUA suis berasingan tersimpan
   sebagai kolum (`jawatan_ikhwan_aktif`, `jawatan_pas_aktif`, boolean, lalai
   `false`), GANTI `jawatan_disahkan_tiada` tunggal. Kedua-dua OFF = maksud
   sama dengan "tiada jawatan" dulu. `jawatan_ikhwan_3`/`jawatan_pas_3`
   DIBUANG kekal (tiada data pun, tidak masalah).

**Migration 074 reset data produksi (324 ahli) semasa rombak**: (a)
`status_perkahwinan`/`spouse_member_id`/`nama_pasangan` di-NULL untuk SEMUA
ahli (arahan eksplisit — model baharu, isi semula dari kosong); (b)
`status_pekerjaan` di-NULL untuk nilai retired (`berniaga_usahawan`,
`belajar_sepenuh_masa`, `bekerja_dan_belajar` — Perniagaan kini table
berasingan, TIADA baris `member_businesses` direka-reka daripada data lama
sebab mode/sub-kategori tiada dalam data asal); (c) `sektor_pekerjaan`
di-NULL (teks bebas lama tidak padan chip 3-pilihan baharu). Suis Komitmen
DIBACKFILL (bukan lalai `false` retroaktif seperti dulu) — `jawatan_ikhwan_aktif`/
`jawatan_pas_aktif` ditanda `true` untuk ahli yang SUDAH ADA data dalam
`jawatan_ikhwan_1/2`/`jawatan_pas_1/2`/`no_keahlian_pas`, supaya data sedia
ada tidak tersembunyi di sebalik suis yang nampak OFF. Snapshot rollback:
`backup_20260929.members_pre_rombak` (dicipta oleh migration `073`, di dalam
pangkalan data yang sama — bukan pg_dump luaran, Docker tidak tersedia semasa
rombak ini dijalankan).

## Formula 6 kategori Dashboard (`member_completeness_rows()`)

Peratus keseluruhan = (kategori siap ÷ 6) × 100%, dibundarkan ke integer
terdekat → 0/17/33/50/67/83/100%.

1. **Data Peribadi**, **2. Pendidikan** — tidak berubah daripada versi lama.
3. **Pekerjaan** — `status_pekerjaan` wajib + (jika `= 'bekerja'`) sektor,
   jawatan, majikan, negeri, pendapatan semua wajib.
4. **Perniagaan** (BAHARU) — Siap jika ahli TIADA baris `member_businesses`
   (automatik siap), ATAU SEMUA barisnya lengkap (mode + ≥1 sub-kategori +
   nama + negeri + pendapatan).
5. **Keluarga** — Siap jika `bujang` (automatik siap), ATAU
   (`berkahwin`/`pernah_berkahwin` DAN pasangan (MBM/nama) DAN `bil_anak`
   terisi DAN, jika `pernah_berkahwin`, `sebab_bercerai_kematian` terisi).
6. **Komitmen** — Siap jika kedua-dua suis OFF, ATAU (mana-mana suis ON dan
   medan berkaitannya semua terisi).

**Dikecualikan terus** (sama seperti dulu): `full_name`, `generasi`, `email`,
`nombor_ahli`, `pembiayaan_lain`, `nama_anak`.

**Ahli yang dikira**: hanya `not disekat`. **Kebenaran**: sama seperti dulu —
kedua-dua RPC guna `can_view_members()`, logik dikongsi melalui
`member_completeness_rows()` (fungsi dalaman, tidak di-grant kepada
`authenticated`).

## Muat naik Excel (`ahli-upload` / `lib/ahli-import.ts`)

9 lajur Excel (`AlamatTempatBekerja`, `JenisPerniagaan`,
`AnggaranPendapatanIsiRumah`, `BilTanggunganSelainKeluarga`, `PekerjaanIbu`,
`PekerjaanBapa`, `BilTanggunganIbuBapa`, `JawatanIkhwan3`, `JawatanPas3`)
KEKAL dalam `AHLI_COLUMNS`/fail eksport (bentuk fail tidak berubah bilangan
lajur — sama corak dengan `NoTel2`/`Pekerjaan`/`Role`/`BilTanggungan` sedia
ada) tetapi SENTIASA kosong — field DB-nya sudah tiada. `negeri_tempat_kerja`
dan `sebab_bercerai_kematian` (baharu) TIDAK boleh diisi melalui Excel
(diisi kemudian dalam borang).

Berbeza daripada `jawatan_disahkan_tiada` lama (yang muat naik semula
menetapkannya semula ke `false`): `jawatan_ikhwan_aktif`/`jawatan_pas_aktif`
DIDERIVASI semasa import daripada kehadiran `JawatanIkhwan1/2`/
`JawatanPas1/2`/`NoKeahlianPas` dalam baris itu — sebab kedua-dua medan ini
berkait TERUS dengan data yang datang dari Excel; lalai `false` akan
menyembunyikan jawatan yang baru diimport pada setiap muat naik semula, bukan
sekali sahaja seperti kes `jawatan_disahkan_tiada`.

`toStatusPekerjaan()`: `berniaga_usahawan`/`belajar_sepenuh_masa`/
`bekerja_dan_belajar` DIBUANG (retired). 'BERNIAGA'/'USAHAWAN' sengaja pulang
`null` (amaran sedia ada menangkapnya) — TIADA percubaan reka baris
`member_businesses` daripada teks bebas. 'BELAJAR' bersendirian (tiada
'BEKERJA') pulang `tidak_bekerja` (benar, bukan rekaan — `status_pengajian`
menjejaki fakta belajar secara berasingan).

# Rombak Tab Pendidikan (borang ahli) — rekod keputusan (2026-09-29)

Rujukan penuh: `supabase/migrations/20260929000076_pendidikan_rombak_backup.sql`,
`20260929000077_pendidikan_rombak.sql`, `20260929000078_member_data_completeness_v3.sql`,
`components/member-form.tsx` (tab Pendidikan), `lib/schools.ts`,
`lib/member-education.ts`, `app/(app)/admin/senarai-sekolah.tsx`.

Susulan sama hari kepada rombak 6-tab di atas — hanya tab Pendidikan berubah,
5 tab lain KEKAL. Dua perubahan struktur:

1. **`sekolah` (teks bebas) → `sekolah_id` (FK kepada `schools`, BAHARU)** —
   senarai sekolah kini diurus admin (skrin `admin/senarai-sekolah.tsx`),
   bukan senarai tetap dalam kod. RLS sama corak PERSIS `generations`: baca
   terbuka, tulis Super Admin sahaja (`is_super_admin()`) — dipilih kerana
   ia sepadan bentuk/tujuan yang sama (senarai rujukan kecil untuk dropdown),
   BUKAN `can_edit_members()`. `members.sekolah_id` guna `on delete
   restrict` (sama seperti `members.generasi`) — padam sekolah yang masih
   dirujuk ahli DITOLAK oleh DB, admin mesti nyahaktifkan (`aktif = false`)
   dahulu; skrin admin ada butang sunting nama (generasi tidak, kerana kod
   generasi ialah kunci rujukan stabil, nama sekolah bukan).
2. **8 medan pendidikan flat pada `members` → table `member_education`
   (BAHARU, satu-ke-banyak, sama corak `member_businesses`)** — `tahap_pendidikan`,
   `status_pengajian`, `nama_institusi`, `alamat_institusi`, `tahun_pengajian`,
   `jurusan_pengajian`, `sumber_pembiayaan`, `pembiayaan_lain` DIBUANG kekal.
   Seorang ahli boleh merekod BEBERAPA peringkat pendidikan selepas SPM
   (`peringkat`: stpm/diploma/matrikulasi/asasi/sijil_tvet/program_perguruan/
   sarjana_muda/sarjana/phd/lain_lain; `jurusan`; `institusi`;
   `status_pengajian`: tamat/sedang_menjalani; `sumber_pembiayaan` — HANYA
   bermakna bila `status_pengajian = 'sedang_menjalani'`, ptptn/jpa/
   biasiswa_lain/sendiri/lain_lain). TIADA toggle "Ada Pendidikan" (tidak
   seperti Perniagaan) — senarai terus dipapar dengan butang "+ Tambah
   Tahap", mula kosong; senarai kosong tetap dikira SIAP dalam Dashboard
   (ahli yang tidak pernah lanjut pengajian selepas SPM bukan "tak lengkap").

**Data lama TIDAK dipadan automatik** — `sekolah` (teks) di-NULL-kan terus
untuk SEMUA ahli (tidak cuba dipadan kepada `schools` baharu), dan 8 medan
flat lama TIDAK dipindah ke `member_education` (mod baharu — peringkat
selepas SPM berstruktur — tidak wujud dalam data lama). Sama falsafah dengan
rombak 6-tab: biar diisi semula dari kosong. Snapshot rollback:
`backup_20260929.members_pre_pendidikan_rombak`.

**Formula Dashboard (v3, `member_completeness_rows()`)** — kategori
Pendidikan (nama KEKAL, formula berubah): Siap jika `sekolah_id` diisi, DAN
(senarai `member_education` kosong ATAU setiap baris lengkap: jurusan +
institusi terisi, dan `sumber_pembiayaan` terisi hanya bila
`status_pengajian = 'sedang_menjalani'`). Lima kategori lain (Data Peribadi,
Pekerjaan, Perniagaan, Keluarga, Komitmen) TIDAK berubah daripada v2.

**Konsequen wajib (bukan skop tambahan)**: `member_statistics()` (Rumusan
Ahli) mengira kategori "Sekolah" daripada `m.sekolah` teks lama dipadan
senarai tetap — dengan `sekolah_id` (FK dinamik), block itu ditulis semula
sebagai JOIN kepada `schools` (kiraan ikut `sekolah_id`, label = nama
sekolah, `null` → "Tiada Rekod"). `members_full_export()` juga ditulis
semula — 8 medan flat dibuang, `sekolah` (nama) diselesai melalui JOIN
kepada `schools` (bukan lagi kolum terus); `member_education` (1-ke-banyak)
TIDAK disertakan, sama keputusan seperti `member_businesses`.

**Perkaderan Usrah Sekolah (naqib/mad'u) TIDAK tersentuh** — table
`sekolah_usrah_groups.sekolah` (teks bebas, konsep BERBEZA sepenuhnya
daripada `members.sekolah_id`) sebelum ini secara kebetulan berkongsi
senarai `SEKOLAH_OPTIONS` yang sama daripada `types/database.ts`. Selepas
`SEKOLAH_OPTIONS` dibuang (khusus untuk `members.sekolah` lama), senarai
tetap 8 nama sekolah itu DIPINDAH menjadi konstanta tempatan dalam
`app/(app)/admin/usrah-group-create.tsx` sendiri (satu-satunya pengguna) —
bukan dipulihkan ke `types/database.ts`.

**Muat naik Excel**: `sekolah` (teks bebas) TIDAK dipetakan kepada
`sekolah_id` — nama lama tidak boleh dipadan selamat kepada FK baharu, ahli
isi semula pilih dari dropdown. 7 lajur pendidikan flat (`NamaInstitusi`,
`AlamatInstitusi`, `TahunPengajian`, `JurusanPengajian`,
`PembiayaanPengajian`, `NyatakanPembiayaan`, `TahapPendidikan`) KEKAL dalam
`AHLI_COLUMNS`/fail eksport (bentuk fail tidak berubah) tetapi SENTIASA
kosong. Lajur bacaan sahaja `StatusPengajian` (di hujung fail, luar
`AHLI_COLUMNS`) DIBUANG kekal — bukan dikekalkan kosong seperti 7 di atas,
kerana ia konsep "satu status" yang sudah tidak wujud (per-entry kini,
1-ke-banyak) dan mengekalkannya kosong akan mengelirukan, bukan konsisten.

**Nota infra**: sejarah migration CLI (`supabase_migrations.schema_migrations`)
sebelum ini hanya merekodkan `20260906000001`–`20260906000008` — migration
`20260907000009` hingga `20260929000071` telah live di production tetapi
tidak direkod (dulu ditampal manual ke SQL Editor sebelum CLI berfungsi
penuh). Dibaiki 2026-09-29 dengan `supabase migration repair --status
applied <63 versi> --linked` (bookkeeping sahaja, tiada SQL lama dijalankan
semula) supaya `supabase db push --linked` betul-betul selektif sejak itu.
