-- =============================================================================
-- MySAFF — Poster dan kod QR dipapar BERASINGAN
--
-- Jalankan SELEPAS 20260913000024_qr_token_server_generated.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Poster gabungan (poster + QR dalam satu imej, 20260913000022) dibuang. Ahli
-- kini melihat poster dan kod QR mentah secara berasingan di skrin butiran
-- acara, dan boleh menyimpan kod QR itu.
--
-- MODEL KESELAMATAN — SAMA seperti poster gabungan
-- ------------------------------------------------
-- Sebelum ini ahli sudah memegang kod QR melalui imej poster ber-QR. Kini
-- `qr_token` dipulangkan terus sebagai teks. Kepercayaannya tidak berubah:
-- sesiapa yang memegang kod boleh cuba mendakwa hadir, dan halangannya ialah
-- geofence dan tetingkap masa dalam `usrah_claim_attendance`. Program TANPA pin
-- lokasi boleh dituntut dari mana-mana selagi aktif. Akses ke fungsi ini kekal
-- `can_read_shared()` (ahli aktif yang dipautkan), acara `is_active` sahaja.
--
-- Kolum `poster_with_qr_url` DIKEKALKAN (elak perubahan yang memecahkan), tetapi
-- tiada lagi dibaca atau ditulis oleh app, dan nilainya dikosongkan.
-- =============================================================================


-- 1. DIREKTORI ACARA: qr_token menggantikan poster_with_qr_url -----------------

drop function if exists public.event_upcoming_directory();

create or replace function public.event_upcoming_directory()
returns table (
  id            uuid,
  event_type    text,
  name          text,
  poster_url    text,
  qr_token      text,
  start_date    date,
  end_date      date,
  start_time    time,
  end_time      time,
  location_text text
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
    e.qr_token,
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


-- 2. NAMA FAIL: '<event_id>-qr.jpg' tidak lagi dibenarkan ---------------------
--
-- Badan fungsi seperti 20260913000017; pola event-posters kembali kepada
-- '<uuid>.jpg' sahaja.

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
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
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


-- 3. Kosongkan rujukan poster gabungan ----------------------------------------

update public.usrah_events set poster_with_qr_url = null where poster_with_qr_url is not null;

notify pgrst, 'reload schema';
