-- =============================================================================
-- mysaf-off — Poster program dengan kod QR terbenam
--
-- Jalankan SELEPAS 20260913000021_birthday_today.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Admin menjana SATU imej: poster program dengan kod QR kehadiran di atasnya.
-- Imej itu disimpan berasingan daripada `poster_url`, yang kekal poster asal
-- untuk carousel skrin Utama.
--
-- KEPUTUSAN PRODUK YANG MENGUBAH MODEL KESELAMATAN
-- ------------------------------------------------
-- Sebelum ini kod QR hanya dipegang admin dan dipapar di lokasi program —
-- `event_upcoming_directory()` sengaja tidak mendedahkannya. URL poster ber-QR
-- kini dipulangkan kepada SETIAP ahli supaya mereka boleh menyimpannya dan
-- mengimbasnya dari galeri. Sesiapa yang memegang imej itu memegang kod QR.
-- Halangan yang tinggal untuk kehadiran jarak jauh ialah geofence (koordinat
-- GPS boleh dipalsukan) dan tetingkap masa; program TANPA pin lokasi boleh
-- dituntut dari mana-mana. Admin yang tidak mahu ini untuk program tertentu
-- hanya perlu tidak menjana poster ber-QR baginya.
-- =============================================================================

alter table public.usrah_events
  add column if not exists poster_with_qr_url text;


-- =============================================================================
-- 1. NAMA FAIL: '<event_id>-qr.jpg' dibenarkan dalam event-posters
--
-- Badan fungsi disalin daripada 20260913000017 dengan SATU perubahan pada corak
-- event-posters. Nama berasingan dan bukan menimpa '<event_id>.jpg', supaya
-- poster asal tidak pernah hilang.
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
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-qr)?\.jpg$'
      when 'announcement-posters' then
        p_name ~ '^poster-[0-9]{10,16}\.jpg$'
      when 'payment-qr' then
        p_name ~ '^qr-[0-9]{10,16}\.jpg$'
      else false
    end,
    false
  );
$$;

revoke all on function public.storage_name_ok(text, text) from public, anon;
grant execute on function public.storage_name_ok(text, text) to authenticated;


-- =============================================================================
-- 2. DIREKTORI ACARA: tambah poster_with_qr_url
--
-- Bentuk pulangan berubah, jadi fungsi digugurkan dahulu. Semakan
-- `can_read_shared()` daripada 20260913000017 dikekalkan.
-- =============================================================================

drop function if exists public.event_upcoming_directory();

create or replace function public.event_upcoming_directory()
returns table (
  id                 uuid,
  event_type         text,
  name               text,
  poster_url         text,
  poster_with_qr_url text,
  start_date         date,
  end_date           date,
  start_time         time,
  end_time           time,
  location_text      text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.event_type,
    e.name,
    e.poster_url,
    e.poster_with_qr_url,
    e.start_date,
    e.end_date,
    e.start_time,
    e.end_time,
    e.location_text
  from public.usrah_events e
  where e.is_active
    and e.end_date >= current_date
    and public.can_read_shared()
  order by e.start_date, e.start_time;
$$;

revoke all on function public.event_upcoming_directory() from public, anon;
grant execute on function public.event_upcoming_directory() to authenticated;

notify pgrst, 'reload schema';
