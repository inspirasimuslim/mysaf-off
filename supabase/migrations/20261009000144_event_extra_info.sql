-- =============================================================================
-- Maklumat Tambahan acara (program & usrah)
--
-- Poster utama kekal pada `usrah_events.poster_url` (satu poster, lalai).
-- Penganjur boleh, jika perlu, menambah penerangan dan poster tambahan —
-- dipaparkan di hujung skrin butiran acara ahli, selepas butang Navigasi.
--
-- Table berasingan (bukan kolum pada `usrah_events`) kerana:
--   - `usrah_events` tertutup kepada ahli (memegang `qr_token`); ahli membacanya
--     melalui RPC direktori. Maklumat tambahan tiada rahsia, jadi ia boleh dibaca
--     terus tanpa mengubah / menulis semula RPC direktori yang sedia ada.
--   - Kebanyakan acara tidak mempunyainya — tiada baris, tiada bahagian.
--
-- Tulis: sama seperti poster acara — `can_edit_usrah()` atau `can_edit_program()`.
-- Fail poster tambahan disimpan dalam bucket `event-posters` sedia ada
-- ('<event_id>-info-<cap masa>-<n>.jpg'); polisi bucket itu sudah membenarkan
-- penyunting usrah/program memuat naik, jadi tiada polisi storage baharu.
--
-- Tiada data sedia ada diubah, jadi tiada snapshot backup diperlukan.
-- =============================================================================

create table if not exists public.event_extra_info (
  event_id    uuid primary key references public.usrah_events (id) on delete cascade,
  description text,
  poster_urls text[] not null default '{}',
  updated_at  timestamptz not null default now(),

  constraint event_extra_info_description_length check (description is null or char_length(description) <= 4000),
  constraint event_extra_info_poster_count check (cardinality(poster_urls) <= 8)
);

alter table public.event_extra_info enable row level security;

drop policy if exists event_extra_info_select on public.event_extra_info;
create policy event_extra_info_select on public.event_extra_info
  for select to authenticated
  using (true);

drop policy if exists event_extra_info_insert on public.event_extra_info;
create policy event_extra_info_insert on public.event_extra_info
  for insert to authenticated
  with check (public.can_edit_usrah() or public.can_edit_program());

drop policy if exists event_extra_info_update on public.event_extra_info;
create policy event_extra_info_update on public.event_extra_info
  for update to authenticated
  using (public.can_edit_usrah() or public.can_edit_program())
  with check (public.can_edit_usrah() or public.can_edit_program());

drop policy if exists event_extra_info_delete on public.event_extra_info;
create policy event_extra_info_delete on public.event_extra_info
  for delete to authenticated
  using (public.can_edit_usrah() or public.can_edit_program());

revoke all on public.event_extra_info from anon;
grant select, insert, update, delete on public.event_extra_info to authenticated;
