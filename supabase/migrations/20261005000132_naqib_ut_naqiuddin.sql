-- Lantik MUHAMMAD NAQIUDDIN BIN AHMAD SHUKRI (i11) sebagai naqib kumpulan
-- "Kumpulan Utama" kawasan UT (arahan pemilik sistem, 2026-10-05).
-- Satu-satunya ahli bernama Naqiuddin; sudah ahli kumpulan itu. Tiada data
-- sedia ada diubah (insert sahaja, dilindungi on conflict + had 2 naqib).
insert into public.kumpulan_usrah_naqib (kumpulan_id, member_id)
select ku.id, m.id
  from public.kumpulan_usrah ku, public.members m
 where ku.kawasan_usrah = 'UT' and ku.nama = 'Kumpulan Utama'
   and m.id = '8fc71376-2ae3-4967-bc66-388990738d53'::uuid
   and not exists (select 1 from public.kumpulan_usrah_naqib n where n.kumpulan_id = ku.id and n.member_id = m.id);
