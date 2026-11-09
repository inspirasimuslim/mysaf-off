-- Hubungi kaunselor hanya melalui mesej dalam app: nombor telefon kaunselor tidak lagi didedahkan kepada ahli.
-- Bentuk pulangan tidak berubah (klien lama membaca no_tel = null).
create or replace function public.counseling_counselors()
returns table (id uuid, full_name text, generasi text, no_tel text,
               pendidikan text, pekerjaan text, gambar_path text)
language sql stable security definer set search_path = public
as $$
  select c.id,
         coalesce(nullif(btrim(c.nama_penuh), ''), m.full_name),
         m.generasi, null::text,
         nullif(btrim(c.pendidikan), ''), nullif(btrim(c.pekerjaan), ''), c.gambar_path
  from public.counselors c
  join public.members m on m.id = c.member_id
  where c.aktif and not m.disekat
    and auth.uid() is not null and not public.account_suspended(auth.uid())
    and c.member_id is distinct from public.my_member_id()
  order by m.full_name;
$$;
