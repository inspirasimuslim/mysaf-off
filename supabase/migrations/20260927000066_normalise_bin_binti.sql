-- Seragamkan singkatan B/B./BI/BIB -> BIN, BT/BT. -> BINTI, full_name UPPERCASE,
-- kemudian sync semula nama_panggilan (sebelum BIN/BINTI, fallback nama penuh).
-- Ruang berganda, aksara khas dan titik lain (ABD., MD.) dikekalkan.
-- Backup: backups/mysaff-backup-2026-09-24_2251.sql
update public.members
set full_name = upper(
  regexp_replace(
    regexp_replace(
      regexp_replace(full_name, '(^|\s)bt\.(?=\S)', '\1BINTI ', 'gi'),
      '(^|\s)bt\.?(?=\s|$)', '\1BINTI', 'gi'),
    '(^|\s)(?:b|bi|bib)\.?(?=\s|$)', '\1BIN', 'gi'));

update public.members
set nama_panggilan = coalesce(
  nullif(btrim(substring(full_name from '(?i)^(.*?)\s+(?:bin|binti)\s')), ''),
  btrim(full_name));

notify pgrst, 'reload schema';
