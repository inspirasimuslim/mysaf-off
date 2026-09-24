-- =============================================================================
-- mysaf-off — Library Dokumen ("Arkib") — Google Drive Shared Drive
--
-- Jalankan SELEPAS 20260924000059_attendance_proximity.sql. Idempotent.
--
-- Sama seperti Album Gambar (20260922000054): fail SEBENAR di Google Drive,
-- `documents` hanya menyimpan METADATA. Muat naik/padam sebenar berlaku dalam
-- Edge Function (`upload-document`, `delete-document`) menggunakan credential
-- Service Account. Tiada konsep department untuk dokumen umum ini:
--   * SELECT  — semua authenticated (terbuka luas).
--   * INSERT  — melalui Edge Function `upload-document` (service_role) sahaja.
--   * DELETE  — pemilik sendiri ATAU Super Admin sahaja.
--
-- CATATAN INSERT: `authenticated` SENGAJA tidak diberi INSERT terus. Baris
-- yang dimasukkan terus boleh menuding `drive_file_id` ke fail ORANG LAIN
-- (dari album/dokumen lain), lalu `delete-document` — yang menganggap pemilik
-- baris berhak memadam fail Drive itu — akan membuang fail orang lain ke
-- Tong Sampah. Muat naik tetap terbuka kepada semua ahli aktif, tetapi hanya
-- melalui Edge Function yang mencipta fail Drive itu sendiri.
-- =============================================================================

create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  uploaded_by     uuid references auth.users (id) on delete set null,
  drive_file_id   text not null,
  file_name       text not null check (char_length(file_name) between 1 and 255),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes between 0 and 20971520),
  category        text check (category is null or char_length(category) between 1 and 60),
  description     text check (description is null or char_length(description) <= 500),
  created_at      timestamptz not null default now()
);

create index if not exists documents_created_at_idx on public.documents (created_at desc);
create index if not exists documents_uploaded_by_idx on public.documents (uploaded_by);

alter table public.documents enable row level security;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (true);

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_super_admin());

-- Lihat nota DEFAULT PRIVILEGES projek ini: table baharu memberi INSERT/UPDATE/
-- DELETE automatik kepada `authenticated` — buang semua kecuali yang dimaksudkan.
revoke all on public.documents from anon, authenticated;
grant select, delete on public.documents to authenticated;

notify pgrst, 'reload schema';
