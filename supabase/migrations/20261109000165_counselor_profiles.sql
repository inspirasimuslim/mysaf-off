-- =============================================================================
-- mysaf-off — Profil kaunselor: gambar, latar belakang pendidikan, pekerjaan (+ nama penuh pilihan)
--
-- Ahli melihat senarai kaunselor (gambar, nama, generasi); ketik satu nama -> butiran penuh.
-- Hanya LAJNAH KEBAJIKAN (can_edit) / Super Admin boleh menyunting profil (RPC), dan memuat naik gambar
-- ke bucket awam `counselor-photos` (JPEG, 1 MB, dimampatkan di klien). Table `counselors` kekal TERKUNCI
-- (tiada GRANT) — semua bacaan/tulisan melalui RPC. Hanya menambah lajur + menulis semula dua RPC bacaan
-- (drop+create kerana bentuk output bertambah). `full_name` yang dipulangkan kepada ahli kini memakai
-- `nama_penuh` bila diisi, jika tidak nama ahli — klien lama terus berfungsi. Idempotent.
-- =============================================================================

alter table public.counselors add column if not exists nama_penuh  text;
alter table public.counselors add column if not exists pendidikan  text;
alter table public.counselors add column if not exists pekerjaan   text;
alter table public.counselors add column if not exists gambar_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.counselors'::regclass and conname = 'counselors_profile_check') then
    alter table public.counselors add constraint counselors_profile_check check (
      (nama_penuh  is null or length(nama_penuh)  <= 120)
      and (pendidikan is null or length(pendidikan) <= 800)
      and (pekerjaan  is null or length(pekerjaan)  <= 200)
      and (gambar_path is null or gambar_path ~ '^kaunselor-[0-9]{10,16}\.jpg$')
    );
  end if;
end $$;

-- Senarai kaunselor aktif untuk ahli (tanpa diri sendiri) — +profil.
drop function if exists public.counseling_counselors();
create function public.counseling_counselors()
returns table (id uuid, full_name text, generasi text, no_tel text,
               pendidikan text, pekerjaan text, gambar_path text)
language sql stable security definer set search_path = public
as $$
  select c.id,
         coalesce(nullif(btrim(c.nama_penuh), ''), m.full_name),
         m.generasi, m.no_tel,
         nullif(btrim(c.pendidikan), ''), nullif(btrim(c.pekerjaan), ''), c.gambar_path
  from public.counselors c
  join public.members m on m.id = c.member_id
  where c.aktif and not m.disekat
    and auth.uid() is not null and not public.account_suspended(auth.uid())
    and c.member_id is distinct from public.my_member_id()
  order by m.full_name;
$$;

-- Senarai untuk LAJNAH KEBAJIKAN — BILANGAN sahaja (tiada identiti ahli) + profil mentah untuk disunting.
drop function if exists public.counseling_admin_list();
create function public.counseling_admin_list()
returns table (id uuid, full_name text, generasi text, aktif boolean, appointed_at timestamptz,
               removed_at timestamptz, ahli_menghubungi integer,
               nama_penuh text, pendidikan text, pekerjaan text, gambar_path text)
language sql stable security definer set search_path = public
as $$
  select c.id, m.full_name, m.generasi, c.aktif, c.appointed_at, c.removed_at,
         (select count(distinct x.member_id)::integer from public.counseling_contacts x where x.counselor_id = c.id),
         c.nama_penuh, c.pendidikan, c.pekerjaan, c.gambar_path
  from public.counselors c
  join public.members m on m.id = c.member_id
  where public.has_department_access('LAJNAH KEBAJIKAN', false)
  order by c.aktif desc, m.full_name;
$$;

-- Sunting profil. `p_set_gambar = false` -> gambar tidak disentuh; true -> ditetapkan kepada `p_gambar_path` (null = buang).
create or replace function public.counseling_update_profile(
  p_counselor   uuid,
  p_nama_penuh  text,
  p_pendidikan  text,
  p_pekerjaan   text,
  p_gambar_path text,
  p_set_gambar  boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_department_access('LAJNAH KEBAJIKAN', true) then
    raise exception 'Anda tidak boleh menyunting profil kaunselor.' using errcode = '42501';
  end if;

  if length(coalesce(p_nama_penuh, '')) > 120 then
    raise exception 'Nama penuh terlalu panjang (maksimum 120 aksara).' using errcode = '22023';
  end if;
  if length(coalesce(p_pendidikan, '')) > 800 then
    raise exception 'Latar belakang pendidikan terlalu panjang (maksimum 800 aksara).' using errcode = '22023';
  end if;
  if length(coalesce(p_pekerjaan, '')) > 200 then
    raise exception 'Pekerjaan terlalu panjang (maksimum 200 aksara).' using errcode = '22023';
  end if;

  update public.counselors
     set nama_penuh = nullif(btrim(p_nama_penuh), ''),
         pendidikan = nullif(btrim(p_pendidikan), ''),
         pekerjaan  = nullif(btrim(p_pekerjaan), ''),
         gambar_path = case when p_set_gambar then p_gambar_path else gambar_path end
   where id = p_counselor;

  if not found then
    raise exception 'Kaunselor tidak ditemui.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.counseling_counselors() from public, anon;
revoke all on function public.counseling_admin_list() from public, anon;
revoke all on function public.counseling_update_profile(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.counseling_counselors() to authenticated;
grant execute on function public.counseling_admin_list() to authenticated;
grant execute on function public.counseling_update_profile(uuid, text, text, text, text, boolean) to authenticated;

-- GAMBAR ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('counselor-photos', 'counselor-photos', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

drop policy if exists counselor_photos_obj_read on storage.objects;
create policy counselor_photos_obj_read on storage.objects
  for select to authenticated using (bucket_id = 'counselor-photos');

drop policy if exists counselor_photos_obj_insert on storage.objects;
create policy counselor_photos_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'counselor-photos' and name ~ '^kaunselor-[0-9]{10,16}\.jpg$'
              and public.has_department_access('LAJNAH KEBAJIKAN', true));

drop policy if exists counselor_photos_obj_update on storage.objects;
create policy counselor_photos_obj_update on storage.objects
  for update to authenticated
  using (bucket_id = 'counselor-photos' and public.has_department_access('LAJNAH KEBAJIKAN', true))
  with check (bucket_id = 'counselor-photos' and name ~ '^kaunselor-[0-9]{10,16}\.jpg$'
              and public.has_department_access('LAJNAH KEBAJIKAN', true));

drop policy if exists counselor_photos_obj_delete on storage.objects;
create policy counselor_photos_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'counselor-photos' and public.has_department_access('LAJNAH KEBAJIKAN', true));

notify pgrst, 'reload schema';
