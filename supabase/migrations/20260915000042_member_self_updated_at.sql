-- =============================================================================
-- MySAFF — Rekod "kali terakhir ahli mengemas kini maklumat dirinya sendiri"
--
-- Jalankan SELEPAS 20260915000041_count_pending_first_login.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- `updated_at` berubah pada SETIAP tulisan — admin membetulkan generasi,
-- reset kata laluan, pautan akaun. Ia tidak menjawab soalan "bila ahli ini
-- sendiri kali terakhir menyemak maklumatnya". Kolum ini menjawabnya.
--
-- Syarat, semuanya di pangkalan data (app tidak menghantar apa-apa bendera):
--   1. `auth.uid() = old.user_id` — tulisan datang daripada sesi ahli itu
--      sendiri. Admin yang menyunting ahli lain sentiasa membawa uid berbeza.
--   2. Sekurang-kurangnya satu kolum yang boleh disunting ahli BERUBAH nilai.
--      Simpan tanpa perubahan sebenar tidak dikira.
--
-- Perbandingan dibuat melalui `to_jsonb(row) - senarai_abaikan`, bukan senarai
-- kolum satu per satu seperti `guard_member_admin_columns`: kolum profil baharu
-- kelak terus dikira tanpa perlu mengingati fail ini. Yang diabaikan ialah
-- kolum admin (sama seperti guard), kolum sistem, dan kolum ini sendiri.
--
-- Nilai yang dihantar klien untuk `self_updated_at` sentiasa diganti — ahli
-- tidak boleh memalsukan tarikh, admin tidak boleh menetapkannya. Hanya laluan
-- tanpa JWT (SQL Editor / psql) dan service_role dibiarkan, untuk isian manual.
-- =============================================================================

alter table public.members
  add column if not exists self_updated_at timestamptz;

create or replace function public.track_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims   json := nullif(current_setting('request.jwt.claims', true), '')::json;
  jwt_role text := claims ->> 'role';
  v_uid    uuid := auth.uid();
  ignored  text[] := array[
    'id', 'created_at', 'updated_at', 'self_updated_at',
    'nombor_ahli', 'generasi', 'email', 'disekat', 'user_id',
    'must_change_password', 'temp_password_expires_at'
  ];
begin
  if claims is null or jwt_role = 'service_role' then
    return new;
  end if;

  new.self_updated_at := old.self_updated_at;

  if v_uid is not null
     and v_uid = old.user_id
     and (to_jsonb(new) - ignored) is distinct from (to_jsonb(old) - ignored) then
    new.self_updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists members_track_self_update on public.members;
create trigger members_track_self_update
  before update on public.members
  for each row execute function public.track_member_self_update();

notify pgrst, 'reload schema';
