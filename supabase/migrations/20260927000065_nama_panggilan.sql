-- Nama Panggilan: boleh disunting ahli sendiri. Bukan kolum admin, jadi
-- guard_member_admin_columns tidak menyentuhnya dan track_member_self_update
-- (perbandingan to_jsonb tolak senarai abaikan) mengiranya automatik.
alter table public.members add column if not exists nama_panggilan text;

-- Backfill sekali: bahagian sebelum perkataan penuh BIN / BINTI (huruf besar/kecil
-- tak dipedulikan, dikelilingi ruang). Tiada padanan (BT, B., dll) -> full_name penuh.
update public.members
set nama_panggilan = coalesce(
  nullif(btrim(substring(full_name from '(?i)^(.*?)\s+(?:bin|binti)\s')), ''),
  btrim(full_name)
)
where true;

notify pgrst, 'reload schema';
