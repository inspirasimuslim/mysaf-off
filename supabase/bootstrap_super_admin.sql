-- =============================================================================
-- Lantik Super Admin PERTAMA
--
-- Jalankan SELEPAS 20260906000001_roles_permissions.sql siap.
-- Tukar emel di bawah kepada emel akaun anda, kemudian jalankan dalam
-- Supabase Dashboard > SQL Editor.
--
-- Nota: panel Super Admin dalam app tidak boleh melantik Super Admin pertama
-- kerana RLS memerlukan seorang Super Admin sedia ada — jadi yang pertama
-- mesti dilantik dari sini.
-- =============================================================================

update public.profiles
set role = 'super_admin'
where lower(email) = lower('apihapps@gmail.com');

-- Sahkan hasilnya.
select id, email, full_name, role
from public.profiles
where lower(email) = lower('apihapps@gmail.com');
