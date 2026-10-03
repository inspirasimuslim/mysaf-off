-- =============================================================================
-- mysaf-off — Cari no. telefon ahli untuk pra-isi WhatsApp (Tambah Iklan Admin)
--
-- `admin/iklan-tambah.tsx` (migration 108) perlu nombor telefon ahli yang
-- DIPILIH admin untuk pra-isi medan WhatsApp (lalai = nombor ahli, admin
-- boleh tukar ke nombor lain terus dalam medan itu). DUA RPC sedia ada
-- tidak sesuai disalahgunakan untuk ini:
--   * `list_members_picker()` terbuka kepada SEMUA ahli (pemilih pasangan) —
--     menambah no_tel di situ akan mendedahkan nombor telefon SEMUA ahli
--     kepada SEMUA ahli lain, kebocoran privasi besar.
--   * `list_members_directory()` sengaja TIDAK mendedahkan `id` (lihat
--     komen `MemberPickerRow` dalam types/database.ts) — tidak boleh
--     dipadankan kepada ahli dipilih.
-- RPC BAHARU, khusus (sekeping no_tel sahaja), disekat can_review_business_ads()
-- — had pendedahan paling kecil untuk tujuan ini.
-- =============================================================================

create or replace function public.get_member_phone_for_business_ad(p_member_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.no_tel
  from public.members m
  where m.id = p_member_id and public.can_review_business_ads();
$$;

revoke all on function public.get_member_phone_for_business_ad(uuid) from public, anon;
grant execute on function public.get_member_phone_for_business_ad(uuid) to authenticated;

notify pgrst, 'reload schema';
