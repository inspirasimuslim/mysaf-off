-- Tambah BINTI yang tertinggal untuk 5 ahli; sync nama_panggilan 5 baris ini sahaja.
update public.members m
set full_name = v.baru,
    nama_panggilan = btrim(substring(v.baru from '(?i)^(.*?)\s+binti\s'))
from (values
  ('AMRINA RASYADA KAMARUZAMAN', 'AMRINA RASYADA BINTI KAMARUZAMAN'),
  ('NUR FARAH SYAZWANI MOHD ZURHAN', 'NUR FARAH SYAZWANI BINTI MOHD ZURHAN'),
  ('NURALIA MUNIRAH HAFIZAH MOHAMED', 'NURALIA MUNIRAH HAFIZAH BINTI MOHAMED'),
  ('SYARIFAH NUR ATIQAH SYED MUSTAPHA', 'SYARIFAH NUR ATIQAH BINTI SYED MUSTAPHA'),
  ('WAN NUR SYAMIMI WAN ZIN', 'WAN NUR SYAMIMI BINTI WAN ZIN')
) as v(lama, baru)
where m.full_name = v.lama;
