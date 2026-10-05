-- Isi `sekolah_id` 24 ahli yang fail senarai tulis 'ARABIAH PASIR MAS'.
-- Disahkan pemilik sistem (2026-10-05): sama dengan MAAHAD MUHAMMADI PASIR MAS.
-- Hanya ahli yang sekolah_id masih NULL. Snapshot: backup_20261005.members_sekolah_pre_fill
-- (migration 129) sudah merekod keadaan NULL asal ahli-ahli ini.
with src(member_id) as (values
  ('9be675e5-b6d1-42e4-90cc-ec3ca1266fcb'::uuid),
  ('8985cb6c-2a40-4f8d-b29b-846b89158f83'::uuid),
  ('9bf900ee-cf28-42fe-81ec-0d67db2437e7'::uuid),
  ('e1b91af7-9b04-4927-8e63-99bd98e6a888'::uuid),
  ('808321ca-0c70-4b89-af77-071d26cc28c8'::uuid),
  ('6e68b2f1-b0c1-4b71-addf-d12237b57ed5'::uuid),
  ('7c25c0ea-0c0b-48e4-8641-6a89ca1be1fd'::uuid),
  ('783175be-59ce-4a08-b193-c934abfbd73a'::uuid),
  ('9ee859fc-b275-4287-9db2-2e201cdfa5ae'::uuid),
  ('c262c1a4-cc7b-4b03-ae91-d0457c54f1aa'::uuid),
  ('0ee74e0a-7cbd-4301-b287-9791a5d7b1ea'::uuid),
  ('62c6688f-924c-4110-b5b2-08b4f4a93ca5'::uuid),
  ('0dc91056-9ada-436e-838c-e400ec60bd74'::uuid),
  ('a830831d-68ff-4749-8bf1-9f02f7aa85a5'::uuid),
  ('2ea8e67c-2445-4c27-a043-157f23fa727c'::uuid),
  ('362bf43e-b6e8-4925-a15f-9b50f6aabcef'::uuid),
  ('c626d376-fe56-429a-9008-696f1db624db'::uuid),
  ('ca639581-7b78-4a21-8a1f-c930c2d4118a'::uuid),
  ('98650a09-fdf5-4c44-9720-55fb0ce144fe'::uuid),
  ('3cef714c-0005-4fad-984f-fb3a7af994a6'::uuid),
  ('ee1f0102-17d4-4695-8546-7e939be7323b'::uuid),
  ('edb85655-8da6-4e95-ac31-66f708f5beb2'::uuid),
  ('a2d557e7-65b5-4d81-ba3f-cd7ade93a2b2'::uuid),
  ('ba53d9aa-82f6-4125-a9d9-7541029c2bd3'::uuid)
)
update public.members m
   set sekolah_id = (select id from public.schools where nama = 'MAAHAD MUHAMMADI PASIR MAS')
  from src
 where m.id = src.member_id
   and m.sekolah_id is null;
