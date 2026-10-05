-- Rais/Raisah Generasi: ganti nama dummy dengan senarai sebenar (Senarai_Nama_Rais_dan_Raisah_Generasi.docx).
-- Padanan melalui emel @iraudhah.com dahulu, kemudian nama penuh. Slot tanpa penyandang
-- ('-' atau kosong dalam senarai) tiada baris, sama seperti i19 sebelum ini.
create schema if not exists backup_20261005;
create table backup_20261005.rais_lantikan_generasi as select * from public.rais_lantikan where jenis = 'generasi';

delete from public.rais_lantikan where jenis = 'generasi';

insert into public.rais_lantikan (jenis, kod, peranan, member_id)
select 'generasi', kod, peranan, mid from (values
  ('i01','rais','08a5f3e9-f36a-4caf-b5c1-cf2c4488337e'::uuid),
  ('i02','rais','5565d111-93cf-4f84-8448-ac16932b12f2'::uuid),
  ('i02','raisah','658cb7a4-7d8a-439e-a72f-a41e6d5aad69'::uuid),
  ('i03','rais','7fa43835-ca09-4d8c-87f4-56794fc212a5'::uuid),
  ('i04','rais','ff37329b-474f-490f-aec6-13b1b29311a3'::uuid),
  ('i05','rais','66564b6a-2dd7-499f-91d9-e22a3b89f844'::uuid),
  ('i06','rais','dc171bbc-d0eb-40fa-acfd-2b1c8fcaa10a'::uuid),
  ('i07','rais','4aecbe3e-8531-460b-8d22-a21578641d43'::uuid),
  ('i07','raisah','8e7a2f59-8b84-4b56-862e-37999845c7d4'::uuid),
  ('i08','rais','0f6b0823-37c3-4130-8781-b3911b740bee'::uuid),
  ('i08','raisah','4667dc12-d536-4d44-967b-9d31bc09526b'::uuid),
  ('i09','rais','0c0dc4bd-c4e1-470d-bef3-a17d14b711c4'::uuid),
  ('i09','raisah','63365910-9fd2-4daf-98e9-b47c91da95b0'::uuid),
  ('i10','rais','41a072f2-fc45-44f1-b965-8308563f98e9'::uuid),
  ('i10','raisah','fe5f3092-9941-4078-abb9-4f73d6987663'::uuid),
  ('i11','rais','9f003f29-04f6-4b33-ae79-48ceb6fca5c3'::uuid),
  ('i11','raisah','964636c5-b889-4d9d-b1ae-9831fa53681b'::uuid),
  ('i12','rais','4aed981f-2c9b-426f-b2f0-3c5aa76c24de'::uuid),
  ('i12','raisah','2c0b41fc-02a1-49bf-8a4e-ceb62b5ba7e6'::uuid),
  ('i13','rais','89dc388a-abbf-460b-91ee-19e2aa79a489'::uuid),
  ('i14','rais','5a0cc705-bbb3-41cb-88a9-305f0dd8f7a9'::uuid),
  ('i14','raisah','4617b457-045d-43a9-84c5-d5e00d3486f0'::uuid),
  ('i15','rais','f3f07973-fe64-480c-8c69-ee12dc0dcdaf'::uuid),
  ('i15','raisah','32b8835b-b865-43d9-8388-ced01cb428b2'::uuid),
  ('i16','rais','f92bc311-8508-44b3-8855-6e3c547b2993'::uuid),
  ('i16','raisah','3b2490c1-05e4-45ae-8beb-6a5e1c20a609'::uuid),
  ('i17','rais','462d16be-4d11-4905-9a2f-ded013dbf6a1'::uuid),
  ('i17','raisah','660cce6f-b089-4b84-8474-11a396a3c0b9'::uuid),
  ('i18','rais','9ea69cd6-3fc8-4394-a46f-919f73043168'::uuid),
  ('i18','raisah','b7d8e572-0efc-4fee-b0f0-6cec8a8e4016'::uuid),
  ('i19','raisah','ff48584f-c9ea-4f56-a42c-4845b805cfc4'::uuid),
  ('i20','rais','b02255c1-9c47-4624-9516-fbdba063d405'::uuid),
  ('i20','raisah','39bd0a6b-43f9-4fc9-afcf-f557e188cb77'::uuid),
  ('i21','rais','3ddf5ec9-5ce7-42ba-8446-597650311e59'::uuid),
  ('i21','raisah','55385259-cf6c-42be-a470-88b926ce4bfd'::uuid),
  ('i22','rais','1702c13f-da3f-4cd7-8f16-0aef4b4a3931'::uuid),
  ('i22','raisah','612a7761-1ff2-4c9f-914b-efc929d11fc5'::uuid),
  ('i23','rais','819986b0-d6eb-4832-ada0-1ecd0f530fe1'::uuid),
  ('i23','raisah','6689654a-87b1-402d-b6d1-9596a2b5d7a1'::uuid),
  ('i24','rais','7ad2a9ee-1723-4fc4-872a-b2953a5b766f'::uuid),
  ('i24','raisah','43eac451-7a4b-4cb2-b5ab-7e0485d67b94'::uuid),
  ('i25','rais','802e4cde-5e2e-4093-9abf-110a24320b61'::uuid),
  ('i25','raisah','11ddae6b-cec6-4ec2-b4a4-c56041e92d40'::uuid),
  ('i26','rais','ffc201b0-e408-4f2e-903f-5cf8e363003e'::uuid),
  ('i26','raisah','30298b2d-625d-4f3b-b608-2a59419ba58e'::uuid),
  ('i27','rais','0e3c2988-81a5-48e4-9560-034c02518b62'::uuid),
  ('i27','raisah','956ea768-6d08-47a3-adde-4446e2855752'::uuid)
) as v(kod, peranan, mid);

do $$ begin
  if (select count(*) from public.rais_lantikan where jenis = 'generasi') <> 47
     or exists (select 1 from public.rais_lantikan where jenis = 'generasi' and member_id is null) then
    raise exception 'verify';
  end if;
end $$;
