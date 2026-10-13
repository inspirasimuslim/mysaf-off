-- =============================================================================
-- Log Aktiviti Admin — dikembalikan kepada SUPER ADMIN (Owner kekal boleh baca).
--
-- Migration 070 mengehadkan bacaan kepada Owner sahaja; kini Super Admin boleh
-- membacanya semula (seperti asal, migration 043). Hanya polisi SELECT berubah:
-- `log_admin_activity()` dan semua pencetus rekod tidak disentuh, tiada data
-- diubah -> tiada snapshot. Eksport Excel dibuat di klien daripada SELECT yang
-- sama, jadi mewarisi kebenaran ini.
-- =============================================================================

drop policy if exists admin_activity_log_select on public.admin_activity_log;
create policy admin_activity_log_select
  on public.admin_activity_log
  for select
  to authenticated
  using (public.is_super_admin() or public.is_owner(auth.uid()));
