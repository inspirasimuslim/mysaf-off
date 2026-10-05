-- Susulan kepada 20261005000124_import_kumpulan_usrah.sql.
--
-- Migration 124 menanda naqib HANYA untuk 5 kawasan single-group (UA-UB, UP,
-- US, UTS, UU) -- extract.py asal (scratchpad) silap mengandaikan 4 sheet
-- berbilang-kumpulan (ULK(MAT)/ULK(MIN)/UPT(MAT)/UPT(MIN)) tiada cara untuk
-- kenal pasti naqib, dan menetapkan NAQIB='' untuk SEMUA baris sheet
-- tersebut. Pemilik sistem (apizsekeru, 2026-10-05) membetulkan: naqib
-- SEBENARNYA ditanda dalam sumber Excel melalui DUA cara berbeza:
--
--   - ULK(MIN), UPT(MAT), UPT(MIN): nama naqib ditulis BOLD dalam lajur NAMA
--     sheet itu sendiri (disahkan: ULK(MAT) 0 nama bold, 3 sheet lain ada).
--   - ULK(MAT) (Muslimat ULK): sheet itu TIDAK guna bold -- naqib sebaliknya
--     dinyatakan dalam lajur NAQIB sheet overview "ULK" (berasingan daripada
--     "ULK(MAT)"/"ULK(MIN)", merangkumi kedua jantina dengan lajur NAQIB
--     bernama teks terus bagi SETIAP ahli). Nama naqib paling kerap
--     dilaporkan setiap kumpulan diambil, dipadan balik kepada ahli yang
--     namanya sendiri sepadan (self-reference = dia naqib kumpulan itu).
--
-- 36 naqib baharu dikenal pasti (1-2 setiap kumpulan, tiada yang melebihi had
-- 2 sedia ada -- disahkan terhadap bilangan SEDIA ADA dalam
-- kumpulan_usrah_naqib sebelum insert ini, bukan diandaikan kosong).
--
-- NOTA PENGESAHAN DIPERLUKAN: "ULK Muslimat 3" -- SEMUA ahli kumpulan itu
-- melaporkan naqib bernama "WAN HASANAH BT. WAN HUSSIN", tetapi tiada ahli
-- dengan nama itu wujud dalam sheet/DB; satu-satunya "WAN HASANAH" ialah
-- "WAN HASANAH BT. WAN HARUN" (ahli kumpulan 3 sendiri) -- kemungkinan besar
-- typo surname sendiri (HARUN/HUSSIN) dalam fail sumber. Ditanda naqib
-- berdasarkan calon tunggal yang munasabah, BUKAN keyakinan automatik --
-- pemilik sistem perlu sahkan/betulkan jika salah.
--
-- Snapshot sebelum (bilangan baris kumpulan_usrah_naqib SEBELUM insert ini):
-- 5 (daripada migration 124).

do $$
declare v_before int;
begin
  select count(*) into v_before from public.kumpulan_usrah_naqib;
  if v_before <> 5 then
    raise exception 'Jangkaan 5 naqib sedia ada (daripada migration 124), dapat %', v_before;
  end if;
end $$;

insert into public.kumpulan_usrah_naqib (kumpulan_id, member_id)
select k.id, v.member_id
from (values
  ('94286a11-34c1-4a96-b2b8-0a22bdae4e74'::uuid, 'ULK', 'Muslimin 1'),
  ('f3f07973-fe64-480c-8c69-ee12dc0dcdaf'::uuid, 'ULK', 'Muslimin 1'),
  ('1e340b0c-deb3-466a-abb9-0a58ffa9180d'::uuid, 'ULK', 'Muslimin 2'),
  ('6b68a773-013b-4135-b318-e1671e34f60e'::uuid, 'ULK', 'Muslimin 2'),
  ('87df3301-579f-4433-ac2b-0f605a1617b9'::uuid, 'ULK', 'Muslimin 3'),
  ('f92bc311-8508-44b3-8855-6e3c547b2993'::uuid, 'ULK', 'Muslimin 3'),
  ('ca93df05-38a6-4277-9822-53e1daaffe68'::uuid, 'ULK', 'Muslimin 4'),
  ('e43cbc28-84ee-4234-84e6-523ac5939fe6'::uuid, 'ULK', 'Muslimin 4'),
  ('abdda6c3-7ec9-4157-ae3a-14749ca79014'::uuid, 'ULK', 'Muslimin 5'),
  ('235f69f1-7c73-4f8f-8b23-b8b8be6a9f01'::uuid, 'ULK', 'Muslimin 5'),
  ('0c0dc4bd-c4e1-470d-bef3-a17d14b711c4'::uuid, 'ULK', 'Muslimin 6'),
  ('e073293a-ccec-4d49-95cd-9a455212f2af'::uuid, 'UPT', 'Muslimat 1'),
  ('66bcc4eb-09e5-4b0b-b54d-fde127082247'::uuid, 'UPT', 'Muslimat 1'),
  ('2c0b41fc-02a1-49bf-8a4e-ceb62b5ba7e6'::uuid, 'UPT', 'Muslimat 2'),
  ('0988de81-b1b9-4453-9c75-efb8e03489d5'::uuid, 'UPT', 'Muslimat 2'),
  ('4d542644-f03a-49f5-9594-364bc8d210eb'::uuid, 'UPT', 'Muslimat 3'),
  ('7818d379-6632-4a7d-a8d6-335fe929ad2a'::uuid, 'UPT', 'Muslimat 3'),
  ('263b51be-861e-457f-8e72-760043e10916'::uuid, 'UPT', 'Muslimat 4'),
  ('dfa1a73d-45c5-4078-968c-ffe244d58659'::uuid, 'UPT', 'Muslimat 4'),
  ('a9e9ae46-c57d-424a-b965-7d5c431f39e7'::uuid, 'UPT', 'Muslimat 5'),
  ('4ce1b8c7-fe11-4d69-84dd-a637f3dfbcb4'::uuid, 'UPT', 'Muslimat 5'),
  ('bf0a844c-9e8f-4e8d-b1fd-8c3e29183197'::uuid, 'UPT', 'Muslimin 1'),
  ('86039291-cbf1-4a49-96be-9731d1c91f64'::uuid, 'UPT', 'Muslimin 1'),
  ('29da9450-bdf7-4401-b805-8deac97fede5'::uuid, 'UPT', 'Muslimin 2'),
  ('41a072f2-fc45-44f1-b965-8308563f98e9'::uuid, 'UPT', 'Muslimin 2'),
  ('8985cb6c-2a40-4f8d-b29b-846b89158f83'::uuid, 'UPT', 'Muslimin 3'),
  ('50c12f3d-06eb-40a9-bfdd-1e6d93eb1f77'::uuid, 'UPT', 'Muslimin 3'),
  ('a830831d-68ff-4749-8bf1-9f02f7aa85a5'::uuid, 'UPT', 'Muslimin 4'),
  ('23792df1-8adb-4623-8e43-b405dc6aaf88'::uuid, 'UPT', 'Muslimin 4'),
  ('5a0cc705-bbb3-41cb-88a9-305f0dd8f7a9'::uuid, 'UPT', 'Muslimin 5'),
  ('7a98cf44-3790-4b2d-881b-9c75243c74a0'::uuid, 'UPT', 'Muslimin 5'),
  ('9fb19f40-31ab-4be1-bd69-7d69fd318768'::uuid, 'ULK', 'Muslimat 1'),
  ('62c6688f-924c-4110-b5b2-08b4f4a93ca5'::uuid, 'ULK', 'Muslimat 2'),
  ('dc17d37a-f842-4f32-a598-ae401056d64a'::uuid, 'ULK', 'Muslimat 3'),
  ('d781ba00-c30b-4fb9-bed0-5e673a5f28ff'::uuid, 'ULK', 'Muslimat 4'),
  ('9f7f1140-5dcf-46f1-b4a1-372205605d6c'::uuid, 'ULK', 'Muslimat 5')
) as v(member_id, kawasan_usrah, nama)
join public.kumpulan_usrah k on k.kawasan_usrah = v.kawasan_usrah and k.nama = v.nama
on conflict do nothing;

notify pgrst, 'reload schema';
