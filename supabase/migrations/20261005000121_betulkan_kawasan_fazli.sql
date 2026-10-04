-- Pembetulan kepada 20261005000120_isi_kawasan_usrah_ahli_2.sql.
--
-- "Fazli" dalam arahan pemilik sistem (apizsekeru) tersilap dipadan pada
-- MUHAMMAD FADHLI BIN MUHAMAD (i11, ejaan "FADHLI") dalam migration 120.
-- Orang yang dimaksudkan sebenarnya NIK MOHD FAZLI BIN NIK ABD RAZAK
-- (i18, ejaan "FAZLI") -- satu daripada 12 ahli asal tanpa kawasan_usrah,
-- kekal tak disedari sebab nama hampir sama ("Fadhli" vs "Fazli").
--
-- Pembetulan (2026-10-05):
--   - Muhammad Fadhli bin Muhamad (i11) -> kembali ke NULL (tidak pernah
--     disebut oleh pemilik sistem; UPT yang diset pada migration 120 silap).
--   - Nik Mohd Fazli bin Nik Abd Razak (i18) -> UPT (orang sebenar yang
--     dimaksudkan).
-- Zulkhairi/Shuhada/Aqilah (migration 120) disahkan betul, tidak disentuh.
--
-- Snapshot sebelum: backup_20261005.members_kawasan_fazli_fix_pre.

create schema if not exists backup_20261005;

create table if not exists backup_20261005.members_kawasan_fazli_fix_pre as
select id, kawasan_usrah
from public.members
where id in (
  '0ee74e0a-7cbd-4301-b287-9791a5d7b1ea', -- Muhammad Fadhli bin Muhamad (i11)
  '3d518dce-a68d-46c2-8b06-a62568b1d89a'  -- Nik Mohd Fazli bin Nik Abd Razak (i18)
)
on conflict do nothing;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.members
  where id in (
    '0ee74e0a-7cbd-4301-b287-9791a5d7b1ea',
    '3d518dce-a68d-46c2-8b06-a62568b1d89a'
  );
  if v_count <> 2 then
    raise exception 'Jangkaan 2 ahli, dapat %', v_count;
  end if;
end $$;

update public.members set kawasan_usrah = null where id = '0ee74e0a-7cbd-4301-b287-9791a5d7b1ea';
update public.members set kawasan_usrah = 'UPT' where id = '3d518dce-a68d-46c2-8b06-a62568b1d89a';

notify pgrst, 'reload schema';
