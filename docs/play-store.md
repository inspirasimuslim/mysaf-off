# MySAFF — Persediaan Google Play

Pakej: `com.sakuradigital.mysafoff` · versi semasa 1.3.20 (kod 26). Play menolak `versionCode` yang pernah digunakan, jadi kod MESTI naik setiap muat naik.

## Fail yang perlu
- **AAB** (bukan APK): `eas build -p android --profile play` (cloud EAS, kunci muat naik diurus EAS), atau di PC: `cd android; .\gradlew bundleRelease` -> `app\build\outputs\bundle\release\app-release.aab`. Gradle lokal mesti ditandatangani dengan keystore muat naik sendiri, BUKAN debug keystore.
- Ikon 512x512 PNG, feature graphic 1024x500, sekurang-kurangnya 2 tangkap layar telefon.

## Halangan sebelum hantar
1. **Dasar Privasi (URL awam)** — SIAP dalam app: `/dasar-privasi` (web). Perlu deploy web dahulu; URL itu dimasukkan dalam Play Console. Isi `SUPPORT_EMAIL` dalam `constants/legal.ts`.
2. **Padam akaun** — SIAP: Tetapan > Padam Akaun (migration 143, berasaskan permintaan), skrin Super Admin `Permintaan Padam Akaun`, URL web `/padam-akaun` untuk Play Console.
3. **Borang Data Safety** — nyatakan: nama, emel, no. telefon, NRIC, lokasi tepat (semasa guna), foto, maklumat kewangan (yuran/PIPIS, bukan kad), disimpan di Supabase, tidak dijual, disulitkan semasa penghantaran.
4. **Akses ujian** — beri akaun ujian (emel + kata laluan) kerana app hanya untuk ahli; tanpa itu reviewer tolak.
5. **Akaun pembangun peribadi baharu**: ujian tertutup 12 penguji selama 14 hari sebelum boleh ke Production.

## Sebelum upload
- Google Maps API key (dalam `app.json`): tambah **SHA-1 Play App Signing** (Play Console > Setup > App signing) pada sekatan key di Google Cloud, kalau tidak peta kosong pada versi dari Play.
- Kebenaran: `RECORD_AUDIO` sudah dibuang. Masih ada `READ/WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED` — Play boleh minta borang justifikasi gambar; kaji sama ada boleh dibuang (pemilih gambar guna Photo Picker tanpa kebenaran).
- Content rating (IARC), kategori (Social/Productivity), sasaran umur 18+.

## Senarai kedai (BM)
**Nama**: MySAFF
**Penerangan ringkas (80)**: Aplikasi ahli SAFF — usrah, program, yuran dan direktori ahli.
**Penerangan penuh**: MySAFF ialah aplikasi rasmi ahli untuk mengurus keahlian dan aktiviti persatuan: semak jadual usrah dan program, sahkan kehadiran melalui QR dan lokasi, RSVP bersama anak dan bermalam, lihat yuran dan sumbangan PIPIS, direktori ahli, carta organisasi, pengumuman dan bisnes ahli. Untuk ahli berdaftar sahaja.
