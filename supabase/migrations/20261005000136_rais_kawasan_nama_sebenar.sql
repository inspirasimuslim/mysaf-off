-- Rais/Raisah Usrah Kawasan: ganti nama dummy dengan senarai sebenar.
-- Slot yang tiada penyandang (tiada raisah UP/UU/US/UTS, tiada rais UB) dipadam, sama seperti i19 (134).
create schema if not exists backup_20261005;
create table backup_20261005.rais_lantikan_kawasan as select * from public.rais_lantikan where jenis = 'kawasan';
do $$ begin
  if (select count(*) from backup_20261005.rais_lantikan_kawasan) <> 16 then raise exception 'count guard'; end if;
end $$;

-- Kemas kini melalui nama penuh (padanan unik, disahkan sebelum ini).
update public.rais_lantikan r set member_id = m.id, updated_at = now()
from public.members m, (values
  ('ULK','rais','MUHAMMAD AKMAL BIN YAACOB'),
  ('ULK','raisah','SITI NUR AINI BINTI NAZULA'),
  ('UPT','rais','MUHAMMAD FAIZ BIN ABDULLAH'),
  ('UPT','raisah','NUR FARAH SYAZWANI BINTI MOHD ZURHAN'),
  ('UU','rais','AHMAD ASLAM BIN MOHD YUSOF'),
  ('UT','rais','MUHAMMAD NAQIUDDIN BIN AHMAD SHUKRI'),
  ('UT','raisah','SITI AMINAH BINTI AZMI'),
  ('US','rais','MUHAMMAD AFIF BIN MAT NAWI'),
  ('UTS','rais','WAN MUHAMMAD ZULFAHMI BIN WAN MUSTAFA'),
  ('UP','rais','ROSMAN AZMI BIN OSMAN'),
  ('UA-UB','raisah','SITI NADHIRAH BINTI AZMI')
) as v(kod, peranan, nama)
where r.jenis = 'kawasan' and r.kod = v.kod and r.peranan = v.peranan and m.full_name = v.nama;

delete from public.rais_lantikan
where jenis = 'kawasan'
  and (kod, peranan) in (('UP','raisah'),('UU','raisah'),('US','raisah'),('UTS','raisah'),('UA-UB','rais'));

do $$ begin
  if (select count(*) from public.rais_lantikan where jenis='kawasan') <> 11
     or exists (select 1 from public.rais_lantikan where jenis='kawasan' and member_id is null) then
    raise exception 'verify';
  end if;
end $$;
