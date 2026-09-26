-- =============================================================================
-- Log Aktiviti Admin — dipindahkan daripada Super Admin kepada OWNER sahaja.
--
-- Hanya SIAPA yang boleh MEMBACA berubah. `log_admin_activity()` dan semua
-- pencetus rekod (SECURITY DEFINER) tidak disentuh — tindakan semua admin
-- tetap direkodkan seperti biasa. Eksport Excel dibuat di klien daripada
-- SELECT ini, jadi mewarisi kebenaran yang sama.
-- =============================================================================

drop policy if exists admin_activity_log_select on public.admin_activity_log;
create policy admin_activity_log_select
  on public.admin_activity_log
  for select
  to authenticated
  using (public.is_owner(auth.uid()));
