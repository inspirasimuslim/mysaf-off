-- =============================================================================
-- mysaf-off — Album Gambar Event (Google Drive Shared Drive, crowd-sourced)
--
-- Jalankan SELEPAS 20260922000053_perkaderan_archive_and_delete.sql.
-- Idempotent.
--
-- Fail SEBENAR (bait imej) tinggal di Google Drive, BUKAN di Supabase
-- Storage — `event_photos` hanya menyimpan METADATA (`drive_file_id`).
-- Muat naik/padam sebenar di Drive berlaku dalam Edge Function (perlukan
-- credential Service Account, tidak boleh berada dalam app client). RLS di
-- sini mengawal metadata sahaja; ia SELARAS dengan semakan kebenaran yang
-- Edge Function padam ulangi secara manual (defense-in-depth, dua lapisan
-- bebas kerana kunci Service Account tidak tertakluk kepada RLS).
-- =============================================================================

alter table public.usrah_events
  add column if not exists drive_folder_id text;


-- =============================================================================
-- 1. TABLE
-- =============================================================================

create table if not exists public.event_photos (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.usrah_events (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  drive_file_id text not null,
  caption     text,
  created_at  timestamptz not null default now()
);

create index if not exists event_photos_event_idx on public.event_photos (event_id);
create index if not exists event_photos_uploaded_by_idx on public.event_photos (uploaded_by);


-- =============================================================================
-- 2. FUNGSI KEBENARAN PADAM
--
-- Padam dibenarkan untuk PEMILIK gambar sendiri, admin can_edit department
-- pemilik jenis acara itu (`can_edit_event()` sedia ada — `event_department()`
-- satu tempat sahaja untuk pemetaan usrah/program), atau Super Admin.
-- =============================================================================

create or replace function public.can_manage_event_photo(p_event_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usrah_events e
    where e.id = p_event_id
      and public.can_edit_event(e.event_type, uid)
  );
$$;

revoke all on function public.can_manage_event_photo(uuid, uuid) from public, anon;
grant execute on function public.can_manage_event_photo(uuid, uuid) to authenticated;


-- =============================================================================
-- 3. ROW LEVEL SECURITY
--
-- SELECT terbuka luas (semua ahli boleh lihat album). INSERT terbuka luas
-- (crowd-sourced) tetapi `uploaded_by` mesti diri sendiri — tiada sesiapa
-- boleh mendakwa muat naik bagi pihak orang lain. TIADA policy UPDATE
-- langsung — RLS menolak SETIAP command tanpa policy secara automatik,
-- walaupun grant table membenarkannya (disahkan empirik semasa membina
-- ciri ini); `revoke update` di bawah adalah lapisan kedua sengaja,
-- bukan bergantung semata-mata kepada ketiadaan policy.
-- =============================================================================

alter table public.event_photos enable row level security;

drop policy if exists event_photos_select on public.event_photos;
create policy event_photos_select on public.event_photos
  for select to authenticated
  using (true);

drop policy if exists event_photos_insert on public.event_photos;
create policy event_photos_insert on public.event_photos
  for insert to authenticated
  with check (uploaded_by = auth.uid());

drop policy if exists event_photos_delete on public.event_photos;
create policy event_photos_delete on public.event_photos
  for delete to authenticated
  using (
    uploaded_by = auth.uid()
    or public.is_super_admin()
    or public.can_manage_event_photo(event_id)
  );

grant select, insert, delete on public.event_photos to authenticated;
-- Lihat nota DEFAULT PRIVILEGES: projek ini memberi UPDATE automatik kepada
-- `authenticated` pada table baharu — revoke eksplisit walaupun RLS sudah
-- menyekatnya (tiada caption/medan lain boleh disunting selepas muat naik).
revoke update on public.event_photos from authenticated;

notify pgrst, 'reload schema';
