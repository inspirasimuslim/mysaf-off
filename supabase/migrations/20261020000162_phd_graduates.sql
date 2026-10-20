-- =============================================================================
-- mysaf-off — Pemegang PhD (tile Direktori): galeri gambar + nama ahli yang berjaya tamat PhD
--
-- Satu table `phd_graduates` (nama sebagai teks, + generasi pilihan) dan bucket gambar awam
-- `phd-gallery`. Semua ahli log masuk boleh BACA (`can_read_shared()`); TULIS (tambah/sunting/padam
-- dan muat naik gambar) hanya admin JABATAN DATA & SUMBER MANUSIA (can_edit) dan Super Admin.
--
-- Nama disimpan sebagai teks (bukan pautan ke `members`) supaya alumni/ahli lama tanpa rekod ahli
-- boleh disenaraikan, dan senarai tidak bergantung pada data pendidikan ahli yang peribadi.
-- Hanya menambah objek baharu -> tiada snapshot. Idempotent.
-- =============================================================================

create table if not exists public.phd_graduates (
  id           uuid primary key default gen_random_uuid(),
  nama         text not null check (length(btrim(nama)) > 0),
  generasi     text,
  bidang       text,
  universiti   text,
  tahun_tamat  integer check (tahun_tamat is null or tahun_tamat between 1950 and 2100),
  tajuk_tesis  text,
  -- Laluan objek dalam bucket `phd-gallery` (NULL = tiada gambar).
  gambar_path  text check (gambar_path is null or gambar_path ~ '^phd-[0-9]{10,16}\.jpg$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists phd_graduates_tahun_idx on public.phd_graduates (tahun_tamat desc nulls last, nama);

drop trigger if exists phd_graduates_set_updated_at on public.phd_graduates;
create trigger phd_graduates_set_updated_at before update on public.phd_graduates
  for each row execute function public.set_updated_at();

-- AKSES -------------------------------------------------------------------------

create or replace function public.can_edit_phd(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.has_department_access('JABATAN DATA & SUMBER MANUSIA', true, uid), false);
$$;

revoke all on function public.can_edit_phd(uuid) from public, anon;
grant execute on function public.can_edit_phd(uuid) to authenticated;

-- RLS ---------------------------------------------------------------------------

alter table public.phd_graduates enable row level security;
revoke all on table public.phd_graduates from anon;
grant select, insert, update, delete on table public.phd_graduates to authenticated;

drop policy if exists phd_graduates_select on public.phd_graduates;
create policy phd_graduates_select on public.phd_graduates for select to authenticated using (public.can_read_shared());
drop policy if exists phd_graduates_insert on public.phd_graduates;
create policy phd_graduates_insert on public.phd_graduates for insert to authenticated with check (public.can_edit_phd());
drop policy if exists phd_graduates_update on public.phd_graduates;
create policy phd_graduates_update on public.phd_graduates for update to authenticated
  using (public.can_edit_phd()) with check (public.can_edit_phd());
drop policy if exists phd_graduates_delete on public.phd_graduates;
create policy phd_graduates_delete on public.phd_graduates for delete to authenticated using (public.can_edit_phd());

-- STORAGE: bucket awam (URL gambar boleh dipaparkan terus); TULISAN dikunci kepada can_edit_phd ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('phd-gallery', 'phd-gallery', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg'];

drop policy if exists phd_gallery_obj_read on storage.objects;
create policy phd_gallery_obj_read on storage.objects
  for select to authenticated using (bucket_id = 'phd-gallery');

drop policy if exists phd_gallery_obj_insert on storage.objects;
create policy phd_gallery_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'phd-gallery' and name ~ '^phd-[0-9]{10,16}\.jpg$' and public.can_edit_phd());

drop policy if exists phd_gallery_obj_update on storage.objects;
create policy phd_gallery_obj_update on storage.objects
  for update to authenticated
  using (bucket_id = 'phd-gallery' and public.can_edit_phd())
  with check (bucket_id = 'phd-gallery' and name ~ '^phd-[0-9]{10,16}\.jpg$' and public.can_edit_phd());

drop policy if exists phd_gallery_obj_delete on storage.objects;
create policy phd_gallery_obj_delete on storage.objects
  for delete to authenticated using (bucket_id = 'phd-gallery' and public.can_edit_phd());

notify pgrst, 'reload schema';
