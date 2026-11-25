-- Lajnah Perkaderan SAHAJA menetapkan kumpulan, partner/naqib dan mad'u.
-- Naqib hanya mengisi laporan sesi, kehadiran, tamrin dan markah (table lain, tidak disentuh).
-- RPC security definer (perkaderan_slot_assign, perkaderan_padam_mad_u) tidak terjejas.

drop policy if exists sekolah_usrah_groups_insert on public.sekolah_usrah_groups;
create policy sekolah_usrah_groups_insert on public.sekolah_usrah_groups for insert to authenticated
  with check (is_super_admin() or can_edit_perkaderan());

drop policy if exists sekolah_usrah_groups_update on public.sekolah_usrah_groups;
create policy sekolah_usrah_groups_update on public.sekolah_usrah_groups for update to authenticated
  using (is_super_admin() or can_edit_perkaderan())
  with check (is_super_admin() or can_edit_perkaderan());

drop policy if exists sekolah_usrah_groups_delete on public.sekolah_usrah_groups;
create policy sekolah_usrah_groups_delete on public.sekolah_usrah_groups for delete to authenticated
  using (is_super_admin() or can_edit_perkaderan());

drop policy if exists sekolah_usrah_mad_u_insert on public.sekolah_usrah_mad_u;
create policy sekolah_usrah_mad_u_insert on public.sekolah_usrah_mad_u for insert to authenticated
  with check (is_super_admin() or can_edit_perkaderan());

drop policy if exists sekolah_usrah_mad_u_update on public.sekolah_usrah_mad_u;
create policy sekolah_usrah_mad_u_update on public.sekolah_usrah_mad_u for update to authenticated
  using (is_super_admin() or can_edit_perkaderan())
  with check (is_super_admin() or can_edit_perkaderan());
