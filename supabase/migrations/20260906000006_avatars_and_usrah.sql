-- =============================================================================
-- mysaf-off — Storage avatar + normalisasi kawasan usrah
--
-- Jalankan SELEPAS 20260906000005_directory_revoke_anon.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
-- =============================================================================


-- =============================================================================
-- 1. BUCKET avatars
--
-- `public = true` menjadikan bacaan terbuka: URL avatar dibenamkan terus dalam
-- senarai direktori, jadi ia perlu boleh dicapai tanpa token bertandatangan.
-- Yang dilindungi ialah TULISAN — lihat policy di bahagian 3.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;


-- =============================================================================
-- 2. SIAPA BOLEH MENULIS AVATAR SESEORANG
--
-- Nama objek ialah '<member_id>.<ext>', jadi pemilikan ditentukan dengan
-- membaca semula `members` — bukan dengan mempercayai apa-apa yang dihantar
-- oleh klien.
-- =============================================================================

/*
  Nama objek datang daripada klien, jadi ia mungkin bukan UUID langsung.
  Penukaran terus akan melontar `invalid input syntax` di tengah penilaian
  policy; fungsi ini menukarkannya kepada NULL supaya policy sekadar menolak.
*/
create or replace function public.uuid_or_null(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.can_manage_member_avatar(member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select member_id is not null
     and (
       public.can_edit_members()
       or exists (
         select 1 from public.members m
         where m.id = member_id and m.user_id = auth.uid()
       )
     );
$$;

grant execute on function public.uuid_or_null(text) to authenticated;
grant execute on function public.can_manage_member_avatar(uuid) to authenticated;


-- =============================================================================
-- 3. POLICY STORAGE
--
-- `can_edit_members()` sudah merangkumi Super Admin (lihat
-- `has_department_access`), jadi tiada cabang berasingan diperlukan di sini.
-- =============================================================================

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.can_manage_member_avatar(public.uuid_or_null(split_part(name, '.', 1)))
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.can_manage_member_avatar(public.uuid_or_null(split_part(name, '.', 1)))
  )
  with check (
    bucket_id = 'avatars'
    and public.can_manage_member_avatar(public.uuid_or_null(split_part(name, '.', 1)))
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and public.can_manage_member_avatar(public.uuid_or_null(split_part(name, '.', 1)))
  );


-- =============================================================================
-- 4. NORMALISASI kawasan_usrah
--
-- Data import ditulis sebagai 'USRAH PANTAI TIMUR (UPT)'. Borang kini
-- menggunakan dropdown berkod, jadi nilai lama diringkaskan kepada kod dalam
-- kurungan — TETAPI hanya bila kod itu antara lapan yang sah. Nilai lain
-- dibiarkan seadanya supaya tiada data hilang secara senyap; dropdown akan
-- memaparkannya apa adanya sehingga admin membetulkannya.
-- =============================================================================

update public.members
   set kawasan_usrah = upper(substring(kawasan_usrah from '\(([A-Za-z]+)\)\s*$'))
 where kawasan_usrah is not null
   and upper(substring(kawasan_usrah from '\(([A-Za-z]+)\)\s*$'))
       in ('US', 'ULK', 'UU', 'UPT', 'UT', 'UTS', 'UB', 'UA');

do $$
declare
  unmatched int;
begin
  select count(*) into unmatched
  from public.members
  where kawasan_usrah is not null
    and kawasan_usrah not in ('US', 'ULK', 'UU', 'UPT', 'UT', 'UTS', 'UB', 'UA');

  raise notice 'kawasan_usrah: % baris masih di luar lapan kod sah', unmatched;
end;
$$;
