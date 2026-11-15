-- =============================================================================
-- Betulkan: muat naik poster tambahan ("Maklumat Tambahan" program/usrah) gagal
--
-- Punca: poster tambahan disimpan sebagai '<event_id>-info-<cap masa>-<n>.jpg'
-- dalam bucket event-posters (migration 144 menganggap polisi bucket sudah
-- membenarkannya), tetapi storage_name_ok() hanya menerima '<event_id>.jpg'
-- untuk bucket itu — jadi polisi INSERT storage menolak setiap poster tambahan
-- dan klien memaparkan "Gagal menyimpan maklumat tambahan."
--
-- Pembaikan: salinan tepat storage_name_ok() daripada 20260929000099 dengan satu
-- perubahan — pola event-posters kini juga menerima akhiran
-- '-info-<10-16 digit>-<digit>'. Cabang lain tidak berubah. Polisi storage
-- (insert/update/delete) tidak disentuh; ia sudah memanggil fungsi ini.
-- Tiada data diubah, tiada snapshot backup diperlukan.
-- =============================================================================

create or replace function public.storage_name_ok(p_bucket text, p_name text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case p_bucket
      when 'avatars' then
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png)$'
      when 'event-posters' then
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-info-[0-9]{10,16}-[0-9]{1,2})?\.jpg$'
      when 'announcement-posters' then
        p_name ~ '^poster-[0-9]{10,16}\.jpg$'
      when 'payment-qr' then
        p_name ~ '^qr-[0-9]{10,16}\.jpg$'
      when 'business-ads' then
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9]{10,16}\.jpg$'
      else false
    end,
    false
  );
$$;

revoke all on function public.storage_name_ok(text, text) from public, anon;
grant execute on function public.storage_name_ok(text, text) to authenticated;

notify pgrst, 'reload schema';
