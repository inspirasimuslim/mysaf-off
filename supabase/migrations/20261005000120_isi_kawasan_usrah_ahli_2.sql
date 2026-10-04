-- Susulan kepada 20261005000119_isi_kawasan_usrah_ahli.sql.
--
-- Selepas pengisian 311/323 ahli daripada padanan automatik fail Excel,
-- baki 12 ahli kekal `kawasan_usrah` NULL (tidak tersenarai dalam fail, atau
-- nama dalam fail terlalu berbeza daripada rekod DB untuk dipadan automatik).
-- Pemilik sistem (apizsekeru) secara manual mengesahkan kawasan sebenar untuk
-- 4 daripada 12 ahli tersebut (2025-10-05):
--   - UPT: Muhammad Fadhli bin Muhamad, Muhammad Zulkhairi bin Mohd Zaidi
--   - ULK: Nur Shuhada binti Mohamed Jaafar
--   - US : Nurul Aqilah binti Ab. Shukor
-- Baki 8 ahli lain kekal NULL (tiada maklumat kawasan lagi, akan diisi
-- kemudian bila ada info).
--
-- Nota: "NURUL AISYAH BINTI MOHD NASIR" (satu daripada 6 baris tak-sepadan
-- fail asal) disahkan BUKAN ahli (tiada rekod dalam `members` langsung) --
-- tiada tindakan DB diperlukan untuknya; baris beliau juga digugurkan daripada
-- fail eksport `Kumpulan_Usrah_Import.xlsx` (317 -> 316 baris).
--
-- Snapshot sebelum (ditulis semula di sini untuk rekod, dah dijalankan ad hoc
-- melalui Management API): backup_20261005.members_kawasan_fill2_pre.

create schema if not exists backup_20261005;

create table if not exists backup_20261005.members_kawasan_fill2_pre as
select id, kawasan_usrah
from public.members
where id in (
  '0ee74e0a-7cbd-4301-b287-9791a5d7b1ea', -- Muhammad Fadhli bin Muhamad
  'adc5c08f-05b1-4ee3-9bcc-5e80e7240f8f', -- Muhammad Zulkhairi bin Mohd Zaidi
  '04ce3b9b-0031-424f-be2a-41b10345f5f8', -- Nur Shuhada binti Mohamed Jaafar
  '629752b8-af8b-4d36-8579-cf34faa5c4c0'  -- Nurul Aqilah binti Ab. Shukor
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
    'adc5c08f-05b1-4ee3-9bcc-5e80e7240f8f',
    '04ce3b9b-0031-424f-be2a-41b10345f5f8',
    '629752b8-af8b-4d36-8579-cf34faa5c4c0'
  );
  if v_count <> 4 then
    raise exception 'Jangkaan 4 ahli, dapat %', v_count;
  end if;
end $$;

update public.members set kawasan_usrah = 'UPT' where id = '0ee74e0a-7cbd-4301-b287-9791a5d7b1ea' and kawasan_usrah is null;
update public.members set kawasan_usrah = 'UPT' where id = 'adc5c08f-05b1-4ee3-9bcc-5e80e7240f8f' and kawasan_usrah is null;
update public.members set kawasan_usrah = 'ULK' where id = '04ce3b9b-0031-424f-be2a-41b10345f5f8' and kawasan_usrah is null;
update public.members set kawasan_usrah = 'US'  where id = '629752b8-af8b-4d36-8579-cf34faa5c4c0' and kawasan_usrah is null;

notify pgrst, 'reload schema';
