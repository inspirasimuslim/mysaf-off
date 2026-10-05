-- Tab Komitmen: tanda suis Jawatan Ikhwan + isi jawatan bagi Rais/Raisah Generasi sebenar (139).
-- Hanya jika belum ada teks 'rais' sedia ada; slot kosong sahaja diisi.
create schema if not exists backup_20261005;
create table backup_20261005.members_pre_rais_generasi_komitmen as
  select * from public.members where id in (select member_id from public.rais_lantikan where jenis = 'generasi');

update public.members m set
  jawatan_ikhwan_aktif = true,
  jawatan_ikhwan_1 = case when nullif(trim(m.jawatan_ikhwan_1), '') is null then t.label else m.jawatan_ikhwan_1 end,
  jawatan_ikhwan_2 = case when nullif(trim(m.jawatan_ikhwan_1), '') is not null and nullif(trim(m.jawatan_ikhwan_2), '') is null then t.label else m.jawatan_ikhwan_2 end
from (
  select r.member_id, initcap(r.peranan) || ' Generasi ' || r.kod as label
  from public.rais_lantikan r
  where r.jenis = 'generasi' and r.member_id is not null
) t
where m.id = t.member_id
  and not (coalesce(m.jawatan_ikhwan_1, '') ilike '%rais%' or coalesce(m.jawatan_ikhwan_2, '') ilike '%rais%');
