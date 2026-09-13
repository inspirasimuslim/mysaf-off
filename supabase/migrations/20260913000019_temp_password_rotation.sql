-- =============================================================================
-- mysaf-off — Kata laluan sementara baharu
--
-- Jalankan SELEPAS 20260913000018_members_full_export.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- `TEMP_PASSWORD` bertukar daripada 'ikhwandihati' kepada 'IKHWANdihati99'
-- supaya lulus syarat kerumitan kata laluan Supabase Auth (huruf besar, huruf
-- kecil, nombor).
--
-- `complete_password_change()` kini menolak KEDUA-DUA nilai. Menukar pemalar
-- tidak mengubah kata laluan sesiapa di Auth: akaun yang diprovision atau
-- direset sebelum ini masih memegang 'ikhwandihati'. Menyemak nilai baharu
-- sahaja akan membenarkan akaun-akaun itu memadam tanda "mesti tukar kata
-- laluan" tanpa menukar apa-apa — lubang yang ditutup oleh 20260913000017.
--
-- Nilai ini diulang daripada `supabase/functions/_shared/admin.ts` dan
-- `lib/temp-password.ts`. Bila ia bertukar lagi, TAMBAH nilai baharu di sini
-- dan jangan buang yang lama selagi ada akaun yang masih memegangnya.
-- =============================================================================

create or replace function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_must    boolean;
  v_expires timestamptz;
  v_hash    text;
begin
  if v_uid is null then
    raise exception 'Sesi tidak sah. Sila log masuk semula.' using errcode = 'MS001';
  end if;

  select m.must_change_password, m.temp_password_expires_at
    into v_must, v_expires
  from public.members m
  where m.user_id = v_uid
  limit 1;

  -- Tiada rekod atau tiada tanda: tiada apa untuk dikosongkan.
  if not found or not v_must then
    return;
  end if;

  if v_expires is not null and v_expires <= now() then
    raise exception 'Tempoh log masuk sementara anda telah tamat. Hubungi Super Admin untuk membukanya semula.'
      using errcode = 'MS004';
  end if;

  select u.encrypted_password into v_hash from auth.users u where u.id = v_uid;

  if v_hash is null
     or v_hash = extensions.crypt('ikhwandihati', v_hash)
     or v_hash = extensions.crypt('IKHWANdihati99', v_hash) then
    raise exception 'Kata laluan anda masih kata laluan sementara. Sila tetapkan kata laluan baharu.'
      using errcode = 'MS005';
  end if;

  perform set_config('app.password_change', 'on', true);

  update public.members
  set must_change_password = false,
      temp_password_expires_at = null,
      updated_at = now()
  where user_id = v_uid;

  perform set_config('app.password_change', 'off', true);
end;
$$;

revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;

notify pgrst, 'reload schema';
