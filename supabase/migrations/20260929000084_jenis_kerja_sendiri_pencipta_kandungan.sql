-- =============================================================================
-- mysaf-off — jenis_kerja_sendiri: tambah 'pencipta_kandungan'
--
-- Jalankan SELEPAS 20260929000083. Hanya melonggarkan CHECK (nilai baharu
-- ditambah, tiada baris sedia ada terjejas) — tiada snapshot dijana.
-- `member_completeness_rows()` TIDAK berubah: cabang 'sendiri' (v5) sudah tidak
-- merujuk `jawatan_pekerjaan`/`nama_majikan` sama sekali.
-- =============================================================================

alter table public.members drop constraint if exists members_jenis_kerja_sendiri_check;
alter table public.members add constraint members_jenis_kerja_sendiri_check check (
  jenis_kerja_sendiri is null or jenis_kerja_sendiri in ('pekerja_gig', 'freelance', 'pencipta_kandungan', 'lain_lain')
);

notify pgrst, 'reload schema';
