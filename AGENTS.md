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

# Rombak Tab Pekerjaan (borang ahli) — rekod keputusan (2026-09-30)

Rujukan penuh: `supabase/migrations/20260929000079_pekerjaan_rombak_backup.sql`,
`20260929000080_pekerjaan_rombak.sql`, `20260929000081_member_data_completeness_v4.sql`,
`components/member-form.tsx` (tab Pekerjaan), `types/database.ts`.
Bahagian "Pekerjaan" dalam rekod rombak 6-tab di atas (chip 3-pilihan sektor,
`10000+`) sudah digantikan oleh yang berikut.

**Kekal**: `status_pekerjaan`, `jawatan_pekerjaan`, `nama_majikan`,
`negeri_tempat_kerja` (struktur DB tidak berubah). **Tiada kolum Pekerjaan
dibuang** — selain lima itu dan `anggaran_pendapatan_range`, tiada lagi medan
Pekerjaan pada `members` (`alamat_tempat_kerja` sudah dibuang oleh 074).

**`sektor_pekerjaan`** — dropdown (bukan chip/segmented lagi), 4 nilai:
`kerajaan`/`swasta`/`glc`/`sendiri`. `separuh_kerajaan_glc` lama dipetakan ke
`glc` oleh migration 080.

**7 kolum baharu (dropdown cascade dari sektor)**, semua nullable, diskop
oleh UI (sektor bertukar → medan sektor lain dikosongkan; swasta↔glc kongsi
dropdown yang sama jadi kekal):
- `kerajaan`: `bidang_kerajaan` (16 pilihan) + `bidang_kerajaan_lain_teks`
- `swasta`/`glc`: `kumpulan_bidang_swasta` (5) → `bidang_khusus_swasta`
  (bergantung kumpulan; nilai unik merentas kumpulan kecuali `lain_lain`,
  jadi satu CHECK gabungan; padanan kumpulan↔bidang dikawal UI sahaja) +
  `bidang_khusus_swasta_lain_teks`
- `sendiri`: "Anda berniaga?" ialah suis `businesses.length > 0` yang SAMA
  dengan "Ada Perniagaan" di tab Perniagaan (kongsi state, bukan kolum
  baharu). Ya → mesej arah ke tab Perniagaan sahaja (`jenis_kerja_sendiri`
  dikosongkan). Tidak → `jenis_kerja_sendiri` (`pekerja_gig`/`freelance`/
  `lain_lain`) + `bidang_kerja_sendiri_lain_teks`.

**Pendapatan**: bracket bawah kekal (`<1000`, `1000-2999`, `3000-4999`,
`5000-9999`); `10000+` diganti `10000-14999`, `15000-19999`, `20000+`.
Ia berkongsi satu senarai (`PENDAPATAN_RANGE_OPTIONS`) dengan
`member_businesses`, jadi CHECK kedua-dua table ditukar. `10000+` lama
di-NULL-kan (tak boleh dipetakan selamat ke satu bracket). Snapshot rollback:
`backup_20260929.members_pre_pekerjaan_rombak` dan
`backup_20260929.member_businesses_pre_pekerjaan_rombak`.

**Dashboard (v4)** — kategori Pekerjaan: `status_pekerjaan` wajib; bila
`bekerja`, sektor/jawatan/majikan/negeri/pendapatan wajib (jawatan + majikan TIDAK wajib bila sektor `sendiri`) DAN bidang ikut
sektor (kerajaan: bidang; swasta/glc: kumpulan + bidang khusus; sendiri:
siap jika ada baris `member_businesses`, jika tidak `jenis_kerja_sendiri`;
`lain_lain` menuntut teks). Bentuk output `member_completeness_rows()` tidak
berubah → `create or replace`, tiada drop.

**`member_statistics()` TIDAK diubah** — ia tidak pernah ada kategori
"Sektor Pekerjaan" (hanya jantina/generasi/sekolah/kawasan/status pekerjaan/
status perkahwinan/negeri). `members_full_export()` ditambah 7 kolum baharu
(drop+create); fail Excel tidak memaparkannya.

**Muat naik Excel**: bentuk fail tidak berubah. `ParsedMember` kini
mengecualikan `sektor_pekerjaan` + 7 medan Bidang supaya upsert TIDAK
menimpa pilihan borang dengan `null` (sebelum ini `sektor_pekerjaan: null`
dihantar setiap kali). `toPendapatanRange()` dikemas kini ke bracket baharu
(<15000 → `10000-14999`, <20000 → `15000-19999`, selebihnya `20000+`).

## Susulan Pekerjaan (2026-09-30, migration 082–083, BELUM di-push)

Rujukan: `20260929000082_pekerjaan_pesara_backup.sql`,
`20260929000083_pekerjaan_pesara_dan_completeness_v5.sql`. Mengatasi butiran
"Anda berniaga?"/sendiri dan formula Pekerjaan dalam bahagian di atas.

- **Status Pekerjaan**: suis ditulis "Bekerja" / "Tidak Bekerja" (lalai
  Tidak Bekerja). OFF -> dropdown sub-status (Suri Rumah/Pesara/Tidak
  Bekerja); `status_pekerjaan` kekal 4 nilai. Pesara -> teks bebas baharu
  `members.bidang_pekerjaan_lama` (dikosongkan bila bukan pesara). **TIDAK
  wajib** dalam kelengkapan (data lama/opsyenal).
- Label medan `jawatan_pekerjaan` kini "Jawatan" sahaja.
- **Sendiri**: suis "Berniaga"/"Tidak Berniaga" = state `businesses.length > 0`
  yang sama dengan tab Perniagaan (tiada kolum baharu). Berniaga -> mesej ke
  tab Perniagaan SAHAJA (jenis/bidang dikosongkan; medan lain disembunyikan).
  Tidak Berniaga -> Jenis Pekerjaan, "Bidang" (teks bebas, SENTIASA
  dipaparkan; guna kolum sedia ada `bidang_kerja_sendiri_lain_teks` — nama
  kekal walau tidak lagi khusus `lain_lain`), Jawatan, "Syarikat/Jenama yang
  Berkaitan (jika ada)" (`nama_majikan`, label sendiri sahaja), Negeri,
  Pendapatan.
- **Kelengkapan v5**: sendiri + ada perniagaan -> Pekerjaan siap; sendiri
  tanpa perniagaan -> jenis + bidang + negeri + pendapatan wajib (jawatan &
  majikan tidak). Kerajaan/swasta/glc tidak berubah. `ParsedMember` juga
  mengecualikan `bidang_pekerjaan_lama`; `members_full_export()` +1 kolum.

## Susulan 2 Pekerjaan (2026-09-30, migration 084, BELUM di-push)

- "Bekerja/Tidak Bekerja" dan "Berniaga/Tidak Berniaga" kini `Segmented`
  (sama komponen Status Perkahwinan), bukan suis; logik/lalai tidak berubah.
- Selagi Sektor Pekerjaan "Sila pilih", tiada medan lain dipaparkan.
- Sendiri (Tidak Berniaga): `jenis_kerja_sendiri` +`pencipta_kandungan`
  (migration 084 melonggarkan CHECK sahaja); medan Jawatan DIBUANG dari UI
  untuk sendiri; `bidang_kerja_sendiri_lain_teks` berlabel "Nama Pekerjaan".
- `member_completeness_rows()` TIDAK berubah — cabang sendiri (v5) memang
  tidak merujuk jawatan/majikan.

# Tab Kesihatan (borang ahli) — rekod keputusan (2026-09-30, migration 085)

Rujukan: `supabase/migrations/20260929000085_member_health_issues.sql`,
`components/member-health-tab.tsx`, `lib/member-health.ts`, `types/database.ts`.
Tab ke-7 (Kesihatan) selepas Komitmen. Tiada snapshot dijana (hanya table +
fungsi baharu, tiada data sedia ada disentuh).

- **Table `member_health_issues`** (1-ke-banyak, sama corak `member_businesses`):
  `jenis_masalah` (CHECK 14 nilai), `nama_penyakit`, `ada_temujanji_hospital`
  (boolean nullable: true=Ya), `keterangan_lain` (hanya `lain_lain`). `tiada`
  dan `tidak_mahu_nyatakan` tiada medan tambahan; 11 kategori lain + `lain_lain`
  ada nama penyakit + temujanji.
- **RLS LEBIH KETAT** — `can_view_health(member_id)` / `can_edit_health(member_id)`:
  pemilik sendiri, Super Admin, admin department `KESIHATAN AHLI` (KHUSUS sejak migration 149, 2026-10-13; sebelum itu `LAJNAH KEBAJIKAN` — admin Kebajikan umum KINI TIDAK lagi ada akses; eksport `members_export_kesihatan()` pun sama)
  (`admin_assignments` via `has_department_access`, view=`can_view`,
  edit=`can_edit`). Admin JABATAN DATA & SUMBER MANUSIA TIDAK mendapat akses.
  Sengaja TIDAK bergantung pada padanan teks carta organisasi.
- **Komponen berdikari** — `MemberHealthTab` memuat/menyimpan sendiri dengan
  butang Simpan sendiri, BUKAN melalui `MemberForm.onSave` (akses berbeza
  daripada tab lain). Pengguna tanpa `can_view_health` nampak notis sahaja.
- **`get_rais_lajnah_kebajikan()`** — RPC `security definer` (nama + `no_tel`),
  terbuka kepada ahli log masuk, untuk mesej "Tidak mahu nyatakan" (+ pautan
  `wa.me`). Padanan pada `org_positions` (ejaan sebenar DB): `bahagian ilike
  '%Lajnah Kebajikan%'` (meliputi "Lajnah Kebajikan (LK)") dan `jawatan` tepat
  `Rais` (abaikan huruf besar/kecil). Untuk PAPARAN kenalan sahaja, bukan
  kebenaran. Jawatan kosong / tiada `no_tel` -> mesej tanpa pautan.
- **Dikecualikan dengan sengaja** (data sensitif): Dashboard Kelengkapan Data,
  `lib/ahli-import.ts`, `lib/member-sheet.ts`/eksport, `members_full_export()`.

# Keluarga + Jawatan Rasmi + Kemaskini Terakhir (2026-09-30, migration 086–087, BELUM di-push)

Rujukan: `20260929000086_keluarga_jawatan_backup.sql` (snapshot
`backup_20260929.members_pre_keluarga_jawatan`), `20260929000087_keluarga_jawatan_rasmi.sql`,
`lib/nric.ts`, `components/member-form.tsx`, `components/self-update-status.tsx`.

- **`nama_anak` DIBUANG** (kolum + medan borang). `list_mbm_couples()` ditulis
  semula tanpanya (drop+create), skrin `ahli-mbm.tsx` tidak lagi memaparkannya.
  `bil_anak` kekal.
- **"Kemaskini terakhir"**: `formatSelfUpdated()` kini tarikh + masa sebenar
  ("30 Sep 2026, 11:14 AM", waktu peranti) — bukan "X hari lalu". Digunakan
  `SelfUpdateStatus`, `SelfUpdateAdminNote`, `admin/ahli-list.tsx`. Tiada DB.
  (Laporan kelengkapan/tarikh lain memang sudah tarikh mutlak.)
- **`members.jawatan_rasmi`** (teks nullable). Hanya `can_edit_jawatan_rasmi()`
  = `has_department_access('SETIAUSAHA', true)` (+ Super Admin, dirangkumi).
  Department SETIAUSAHA = pemilik carta organisasi, BUKAN JABATAN SETIAUSAHA /
  TIMBALAN SETIAUSAHA. Dikuatkuasakan dua lapis: RPC `set_jawatan_rasmi()`
  (laluan tulis biasa — admin SETIAUSAHA belum tentu ada UPDATE pada `members`)
  + trigger `members_guard_jawatan_rasmi` (tolak perubahan langsung oleh
  sesiapa lain, TERMASUK ahli sendiri dan admin JABATAN DATA). Borang: medan
  + butang "Simpan Jawatan" sendiri dalam Maklumat Keahlian (panel Admin
  sahaja), berasingan daripada Simpan utama; tidak melalui `updateMember`.
  Halaman `ahli-detail` masih memerlukan kebenaran LIHAT ahli (JABATAN DATA)
  untuk dibuka — admin SETIAUSAHA tanpa itu belum ada skrin untuk menyuntingnya.
- **Data Utama profil** kini satu baris setiap item ("Generasi: …", "Emel: …",
  "Kawasan Usrah: …"); baris "Jawatan: …" HANYA bila `jawatan_rasmi` ada.
  Direktori: `list_members_directory()` +`jawatan_rasmi` (drop+create),
  dipaparkan di kad `ahli-view` (mobile + panel desktop), tiada baris jika kosong.
- **Baitul Muslim**: `members.cenderung_baitul_muslim` (boolean nullable,
  true=Ya). Soalan dipaparkan bila `status_perkahwinan = 'bujang'` DAN umur > 22.
  TIADA kolum tarikh lahir — umur diterbit daripada 6 digit NRIC (`lib/nric.ts`,
  peraturan abad sama `birthday_today()`); NRIC tak sah/kosong = soalan tidak
  dipaparkan. Status bertukar keluar daripada bujang mengosongkan jawapan.
- **Keputusan**: `member_completeness_rows()` TIDAK diubah — kedua-dua medan
  baharu tidak wajib (jawatan_rasmi ditetapkan admin, bukan diisi ahli; Baitul
  Muslim ialah soalan pilihan bersyarat, bujang kekal "automatik siap").
  `members_full_export()`/Excel TIDAK diubah; `ParsedMember` mengecualikan
  kedua-dua medan supaya upsert import tidak menimpanya.

## Pembetulan: Jawatan dari carta organisasi (2026-09-30, migration 088–089, BELUM di-push)

Menggantikan butiran `jawatan_rasmi` dalam bahagian "Keluarga + Jawatan Rasmi"
di atas — reka bentuk medan manual itu SALAH FAHAM. Jawatan kini automatik
daripada `org_positions` (carta organisasi).

- **Dibuang** (089; snapshot `backup_20260929.members_pre_jawatan_revert` oleh
  088): kolum `members.jawatan_rasmi`, RPC `set_jawatan_rasmi()`, fungsi
  `can_edit_jawatan_rasmi()`, trigger `members_guard_jawatan_rasmi`, UI "Simpan
  Jawatan" dalam `ahli-detail`.
- **Paparan**: "{jawatan} - {bahagian}" (dash berjarak; migration 090), bahagian tanpa akhiran kurungan (cth "Rais" + "Lajnah Kebajikan (LK)" -> "Rais - Lajnah Kebajikan"; tidak digandakan jika jawatan sudah menyebut bahagian),
  satu baris tanpa label, di Data Utama profil dan kad Direktori (`ahli-view`
  mobile + desktop). Ahli tiada rekod carta -> tiada baris.
- **Pilihan bila >1 rekod**: yang PERTAMA ikut urutan carta sedia ada
  (`display_order`, kemudian `created_at`).
- **Sumber data**: `list_members_directory()` (drop+create) memulangkan
  `jawatan` melalui `left join lateral` pada `org_positions` (ikut `member_id`).
  Profil & `ahli-detail` guna `list_org_chart()` sedia ada
  (`jawatanForMember()` dalam `lib/org-chart.ts`) — tiada RPC baharu.
- `cenderung_baitul_muslim`, pembuangan `nama_anak` dan format "Kemaskini
  terakhir" dalam bahagian yang sama KEKAL.

## Penarafan Ahli dan Generasi — pembetulan `jawatan_pas_3` (2026-09-30, migration 091, BELUM di-push)

`activity_scores_internal()` (versi semasa = `20260916000045_yuran_toyyibpay.sql`,
BUKAN 039) masih merujuk `members.jawatan_pas_3` yang dipadam 074 -> fungsi
plpgsql hanya gagal ketika dipanggil, menjatuhkan `member_activity_score()`,
`generasi_terbaik()`, `my_activity_rank()`. 091 = salinan tepat versi 045 tanpa
baris itu. Logik komponen 5 (Jawatan PAS) TIDAK diubah. PELAJARAN: `drop column`
pada `members` mesti disusuli imbasan grep semua fungsi plpgsql untuk nama kolum.

**Susulan (migration 092, BELUM di-push)**: komponen 5 (Jawatan PAS) dalam
`activity_scores_internal()` kini guna `members.jawatan_pas_aktif` SAHAJA
(true = 1 markah, false/null = 0) — bukan lagi teks `jawatan_pas_1/2`.
Komponen lain tidak berubah (salinan tepat versi 091). Kesan: ahli dengan
`no_keahlian_pas` sahaja (suis dibackfill ON oleh 074) kini dapat 1 markah;
suis dimatikan = 0 walaupun teks jawatan masih ada.

## Segerak `bil_anak` + `tahun_berkahwin` antara pasangan MBM (2026-09-30, migration 098)

Rujukan: `20260929000098_sync_bil_anak_pasangan.sql` (snapshot
`backup_20260929.members_pasangan_pre_sync`). Kedua-dua medan per-ahli tidak
pernah disegerakkan, jadi pasangan dipautkan boleh berbeza dan `list_mbm_couples()`
(`coalesce(a, b)`) memaparkan nilai salah seorang sahaja.

- **Peraturan: kemas kini TERAKHIR menang** (setiap medan berasingan). Ubah medan
  pada ahli berpasangan (pautan DUA HALA) -> pasangan diikutkan (trigger
  `members_sync_spouse_shared_fields`, hanya medan yang berubah). Pautan baharu
  (`sync_spouse_link()` dilanjutkan): diubah dalam simpanan yang sama menang;
  satu kosong -> yang terisi; kedua-dua terisi & berbeza -> `self_updated_at`
  lebih baru, sama/kosong -> nilai lebih besar. Logik dalam `pick_bil_anak()` /
  `pick_tahun_berkahwin()`, dikongsi dengan pembaikan data.
- Pembaikan data 2026-09-30: 1 pasangan (0145/0133) diselaraskan. Selepas itu
  `ahli-mbm.tsx` tidak perlu diubah — dua nilai sentiasa sama.
- **Known minor issue (belum disentuh, semak lain hari):** ahli 0145 dipautkan
  MBM tetapi `status_perkahwinan` NULL. Senarai Ahli MBM tidak bergantung padanya.

# Permohonan Zakat / Bantuan (one-off) — TABUNG ZAKAT (2026-10-13, migration 148, BELUM di-push ke produksi)

Rujukan: `supabase/migrations/20261013000148_permohonan_bantuan.sql`, `lib/bantuan.ts`,
`app/(app)/bantuan*.tsx` (ahli), `app/(app)/admin/bantuan*.tsx` (admin), `lib/department-access.ts`
(`useZakatAccess`). Migration HANYA menambah (department/table/fungsi/polisi) dan menulis semula
`admin_notifications()` (+ blok ke-3), tiada snapshot. Diuji pada Postgres 16 tempatan dengan skema tiruan
(bukan Supabase sebenar): ~80 semakan aliran + keselamatan lulus. Migration 148 ditulis semula (belum pernah
dijalankan di produksi) apabila borang manual Google Form diberikan — tiada migration 149.

- **Dua borang satu halaman** (`bantuan-borang.tsx`, param `kategori`): `belajar` dan `bekerja` (Bekerja/Berkahwin),
  ikut Google Form manual LK. Pilihan/dropdown/chip: status (bujang/berkahwin/lain-lain), tahap pendidikan, tinggal di,
  pembiayaan (multi), sebab keperluan (multi), Ya/Tidak, bank (senarai bank + Lain-lain), bilangan (dropdown 0–20).
  Medan disembunyikan mengikut kategori/status (bujang: ibu bapa + adik beradik; berkahwin: bil. anak). Pendapatan
  keluarga/pemohon NULL = belum diisi, RM0 sah. Nama/telefon/generasi diprafill dan disalin sahaja (profil tidak berubah).
- **Boleh dimohon berulang** (bulan-bulan berikutnya): TIADA had dikuatkuasakan. Admin nampak penanda "kemungkinan
  pertindihan" jika pemohon sama ada permohonan lain pada bulan kalendar yang sama (hanya penanda).
- **Skrin selepas hantar**: mesej 7–14 hari bekerja + kenalan LK (pautan WhatsApp) — kenalan di `KENALAN_LK` dalam
  `lib/bantuan.ts` (belajar: Syamsul Irham i17; bekerja: Zulkifli Che Noh i07; Muslimat sama: Izzah Atirah i16, Ili
  Syafaf Amani i15). Tukar kenalan = sunting konstanta itu (perlu build baharu).
- **AKSES ADMIN = department KHUSUS `TABUNG ZAKAT`** (dicipta oleh migration 148), BUKAN `LAJNAH KEBAJIKAN` (yang
  mengurus data ahli/kesihatan). Admin Kebajikan sedia ada TIDAK nampak permohonan — diuji (RLS, RPC, notifikasi).
  Super Admin dirangkumi. Lihat=can_view, tindakan=can_edit. Hub Admin: seksyen "Tabung Zakat" berasingan
  (`useZakatAccess`). **Selepas migration dijalankan, tugaskan admin zakat ke TABUNG ZAKAT (Hub Admin → Admin).**
- **Dokumen sokongan DIBUANG** (borang manual tidak memintanya): tiada table `bantuan_documents`, tiada bucket
  `bantuan-docs`, tiada muat naik — jadi tiada objek yatim dan tiada fail dalam Storage.
- **TIADA akaun bank pada borang.** Selepas permohonan `approved`, ahli menghantar gambar kod QR (DuitNow) dari
  skrin `bantuan-info` (`uploadBantuanQr` → bucket PERSENDIRIAN `bantuan-qr`, JPG/PNG maks 2 MB, mampat JPEG di klien,
  didaftar oleh RPC `bantuan_set_qr`; QR baharu menggantikan lama, objek lama dipadam klien cuba-terbaik). Muat naik
  storage hanya dibenarkan pemilik bila status `approved`; baca = pemilik + admin TABUNG ZAKAT (URL bertandatangan 5 min).
  Admin Kebajikan lain tiada akses. Objek yatim (muat naik tanpa daftar) tidak dibersihkan automatik.
- **Tulisan hanya melalui RPC `bantuan_*`** (`security definer`); `authenticated` hanya ada SELECT. Status,
  `jumlah_diluluskan`, pelulus ditetapkan pelayan. Peralihan: draft→submitted (ahli), submitted→under_review,
  under_review→needs_information/approved/rejected (admin), needs_information→submitted (ahli). approved/rejected
  muktamad. `bantuan_submit` idempoten; `id` draf dijana klien. Jumlah dimohon TIADA (borang tidak memintanya) —
  admin menetapkan `jumlah_diluluskan` (1–1,000,000) semasa meluluskan.
- **Data sulit admin dalam table berasingan** (`bantuan_admin_notes`, baris `bantuan_history` dengan `terlihat_ahli=false`).
  Permohonan SENDIRI dikecualikan daripada senarai/notifikasi/tindakan admin (RLS + RPC); pentadbir lain mesti menyemaknya.
- **Persaingan**: lajur `versi`; tindakan admin menghantar `versi` → 40001 jika sudah berubah. Nombor rujukan
  `BNT-<tahun>-<6 digit>` melalui `bantuan_counters`, diberi sekali pada hantar pertama.
- **Notifikasi (dalam-app sahaja, BUKAN push ke peranti — tiada expo-notifications/FCM dalam projek)**:
  admin — blok dalam `admin_notifications()` (bilangan permohonan `submitted`, termasuk yang dihantar semula; tiada nama/jumlah),
  muncul pada loceng Hub Admin. Ahli — `bantuan_notifikasi_ahli()` (diterbitkan): permohonan `needs_information` ATAU
  `approved`/`rejected` yang `keputusan_dilihat_at` masih NULL; dipapar sebagai banner `BantuanNotice` di Utama + subtitle
  menu Arkib; keputusan ditanda dilihat (`bantuan_tandakan_dilihat`) bila ahli membuka `bantuan-info`. Kelulusan BUKAN
  bayaran — UI tidak pernah memaparkan "Dibayar".
- **Dikecualikan dengan sengaja** (data sensitif): Dashboard Kelengkapan Data,
  `lib/ahli-import.ts`, `lib/member-sheet.ts`/eksport, `members_full_export()`.


# Maklum Balas gaya chat — ahli <-> department (2026-10-13, migration 151, BELUM di-push ke produksi)

Rujukan: `supabase/migrations/20261013000151_feedback_chat.sql`, `lib/feedback-chat.ts`,
`app/(app)/maklum-balas.tsx` (ahli: senarai + chat baharu), `app/(app)/maklum-balas-chat.tsx` (skrin
perbualan dikongsi), `app/(app)/admin/maklum-balas-chat.tsx` (peti masuk admin), `components/feedback-notice.tsx`.

- **Ahli pilih department** (dropdown daripada `feedback_departments()` = semua department aktif; label paparan
  dalam `DEPARTMENT_LABELS`, lib/feedback-chat.ts) lalu mulakan chat. Admin department itu (can_view = lihat,
  can_edit = balas) dan Super Admin melihat/membalas. Sejarah penuh kekal untuk kedua-dua pihak.
- Table `feedback_threads` + `feedback_messages`; SELECT sahaja untuk `authenticated`, tulis melalui RPC
  (`feedback_start/send/mark_read`). Status baca dikongsi: `admin_read_at` (mana-mana admin department),
  `member_read_at`. Had 30 mesej ahli sejam. Perbualan SENDIRI dikecualikan daripada peti masuk/notifikasi admin.
- **Notifikasi dalam-app sahaja**: admin — blok ke-4 `admin_notifications()` (bilangan perbualan belum dibaca,
  hilang bila dibuka); peti masuk di Hub Admin (seksyen "Maklum Balas Ahli", dipaparkan bila `feedback_admin_inbox()`).
  Ahli — `FeedbackNotice` di Utama + lencana jubin Maklum Balas di Direktori (`feedback_member_unread()`).
  Skrin chat memuat semula setiap 10 saat (tiada realtime/push).
- **Maklum balas lama** (`app_feedback`) kekal arkib baca-sahaja Super Admin ("Arkib Maklum Balas Lama"),
  TIDAK dimigrasikan. Skrin tab tersembunyi kekal terpasang: skrin chat/borang guna `key` + param `n` (cap masa).
- Diuji pada Postgres 16 tempatan dengan skema tiruan (akses, balas, tanda baca, RLS); blok `admin_notifications()`
  TIDAK diuji (bergantung pada migration 148).

## Maklum Balas ikut department (2026-10-13, migration 152, BELUM di-push ke produksi)

Menggantikan peti masuk tunggal (151): TIAP seksyen department di Hub Admin ada butang "Maklum Balas" sendiri
(`feedbackRow()` dalam `admin/index.tsx`, lencana belum dibaca) yang membuka `admin/maklum-balas-chat?dept=<id>`.
`feedback_admin_threads(p_department)` menapis; `feedback_admin_unread_by_dept()` membekal peta nama->{id,unread}
(`useFeedbackDepartments()`); `admin_notifications()` blok ke-4 = SATU baris setiap department (kind
`maklum_balas_chat:<id>`, tajuk guna `feedback_department_label()`). Seksyen Hub baharu (hanya butang Maklum Balas):
TSUA, LHESA, LPN, LK (LAJNAH KEBAJIKAN), LM, I-GEM — nama department sedia ada dalam seed. Susunan Hub: SUA, TSUA,
JSU, BK, LT, LP, LHESA, LPG, LPN, LK, LM, LEA, JDSM, I-GEM, Organisasi. Perbualan sendiri tetap dikecualikan.

# Bantuan Kaunseling (2026-10-13, migration 153, BELUM di-push ke produksi)

Rujukan: `supabase/migrations/20261013000153_bantuan_kaunseling.sql`, `lib/counseling.ts`,
`app/(app)/kaunseling.tsx` + `kaunseling-chat.tsx` (ahli/kaunselor), `app/(app)/admin/kaunselor.tsx` (LK),
`admin/kaunseling-peti.tsx` (kaunselor), tile "Bantuan Kaunseling" di `arkib-hub.tsx`. Diuji pada Postgres 16 tempatan.

- **Kaunselor** = ahli yang dilantik admin LAJNAH KEBAJIKAN (can_edit) — table `counselors` (`aktif`, soft-remove; lantik semula
  mengaktifkan baris sama). Senarai ahli: nama + generasi + `members.no_tel`; ketik -> WhatsApp / Telefon / "Mesej dalam app".
- **PRIVASI (syarat utama)**: 4 table (`counselors`, `counseling_contacts/threads/messages`) TERKUNCI — RLS hidup tanpa polisi,
  tiada GRANT; semua akses melalui RPC `security definer`. LK/Super Admin dalam app hanya dapat `counseling_admin_list()` =
  BILANGAN ahli berbeza (`count(distinct member_id)`), tidak pernah identiti. Perbualan hanya boleh dibaca ahli pemilik dan
  kaunselor AKTIF perbualan itu (`my_counselor_id()`). Hati-hati `null = x` dalam semakan akses (guna `coalesce(..., false)`).
- **"Menghubungi"** = ketikan WhatsApp/Telefon (dicatat `counseling_log_contact`, dedupe 1 minit — app TIDAK dapat mengesahkan
  panggilan benar-benar berlaku) + mesej dalam app (`counseling_start`). Kaunselor dibuang: hilang akses perbualan, ahli masih
  nampak sejarah (tidak boleh balas); bilangan + sejarah kekal untuk LK.
- **Hub Admin**: seksyen LK (Kaunselor + Maklum Balas), seksyen "Sesi Kaunseling" untuk kaunselor aktif (`isCounselor()` dalam
  `lib/permissions.tsx`, RPC `is_active_counselor`; kaunselor dibenarkan melepasi guard `admin/_layout.tsx`, sidebar, header,
  dan notifikasi). `admin_notifications()` blok ke-5 (`kaunseling`, tanpa nama ahli). Ahli: lencana tile + banner Utama.
- **Belum dibuat**: kemas kini Data Safety Play Console / `app/dasar-privasi.tsx` (mesej kaunseling, nombor telefon kaunselor).

# Infaq Tabung Zakat (2026-10-13, migration 154, BELUM di-push ke produksi)

Rujukan: `supabase/migrations/20261013000154_infaq_tabung_zakat.sql`, `supabase/functions/create-zakat-bill/`,
`supabase/functions/_shared/toyyibpay.ts` (`GATEWAY_KINDS.zakat`), `lib/zakat-infaq.ts`, `lib/toyyibpay.ts` (kind `zakat`),
`app/(app)/infaq-zakat.tsx` (ahli), `app/(app)/admin/infaq-zakat.tsx` (admin). Diuji pada Postgres 16 tempatan (RLS, pembatalan, RPC admin).

- Infaq sukarela, TIADA sasaran. Corak sama PIPIS: baris `zakat_infaq` 'pending' (amount 0, `requested_amount`) dicipta Edge Function
  sebelum ToyyibPay; HANYA `toyyibpay-callback` (selepas bertanya ToyyibPay) menukar 'success' + amaun. Kekangan: belum/gagal wajib amount 0.
- Ahli: kad "Infaq Tabung Zakat" di tab Bayar/Infaq (`pembayaran.tsx`) -> skrin `infaq-zakat` (bayar + jumlah berjaya + sejarah sendiri).
  RLS: pemilik ATAU `can_view_bantuan_admin()` (TABUNG ZAKAT). Tiada INSERT/UPDATE/DELETE untuk authenticated.
- Admin: Hub -> LK — Tabung Zakat -> "Infaq Zakat": semua rekod (RPC `zakat_infaq_admin_list/summary`, nama + nombor ahli), tapis/cari,
  muat turun Excel (`downloadZakatInfaqExport`, semua status). Admin Kebajikan umum / JDSM TIDAK nampak (diuji).
- `cancel_pending_gateway_payment()` dilanjutkan dengan cabang `zakat_infaq`.
- **DEPLOY**: selepas migration 154 dijalankan, WAJIB deploy Edge Function: `supabase functions deploy create-zakat-bill` DAN
  `supabase functions deploy toyyibpay-callback` (kod `_shared` berubah; callback mesti tahu table `zakat_infaq`). Tanpa deploy callback,
  bayaran infaq kekal 'pending'. Deep link kembali: `mysafoff://infaq-zakat` / `/infaq-zakat` (web). Pastikan `APP_WEB_ORIGINS` memuatkan domain web.

# Features MySAFF + "Apa yang baharu" (2026-10-13, tiada migration)

Rujukan: `lib/app-changelog.ts`, `app/(app)/features.tsx`, `components/whats-new-notice.tsx`, tile di `arkib-hub.tsx`.
- Jubin "Features MySAFF" di Direktori -> skrin `features` (catatan versi terbaru di atas + senarai ciri BM).
- **AMALAN WAJIB setiap kali versi dinaikkan**: tambah entri di HUJUNG `CHANGELOG` (versi = `version` app.json) dan kemas kini `FEATURE_GROUPS`.
- `WhatsNewNotice` (Utama) muncul sekali bagi setiap versi terpasang yang ada entri; versi dilihat disimpan tempatan
  (`lib/secure-storage`, kunci `mysaff.whatsnew.seen`) — per peranti, bukan DB. Tiada entri untuk versi semasa = tiada notifikasi.
- Versi dinaikkan ke 1.3.30 (36) untuk build seterusnya.
