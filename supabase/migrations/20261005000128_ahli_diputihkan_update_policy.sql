-- Tambah RLS UPDATE pada `ahli_diputihkan` supaya rekod boleh disunting.
--
-- Migration `20260923000058` sengaja TIDAK ada polisi UPDATE ("rekod ini
-- ditambah atau dipadam, tidak disunting selepas dicipta") -- pemilik sistem
-- (apizsekeru, 2026-10-05) kini minta fungsi sunting ditambah ("Kau tambah
-- fungsi untuk edit senarai ahli diputihkan"), jadi keputusan reka bentuk
-- asal itu digantikan di sini. Kebenaran sama seperti insert/delete
-- (`can_edit_ahli_diputihkan()` -- department SETIAUSAHA / Super Admin).

drop policy if exists ahli_diputihkan_update on public.ahli_diputihkan;
create policy ahli_diputihkan_update on public.ahli_diputihkan
  for update to authenticated
  using (public.can_edit_ahli_diputihkan())
  with check (public.can_edit_ahli_diputihkan());

grant update on public.ahli_diputihkan to authenticated;

notify pgrst, 'reload schema';
