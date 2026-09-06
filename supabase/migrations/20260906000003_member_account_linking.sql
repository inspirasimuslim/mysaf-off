-- =============================================================================
-- mysaf-off — Pautan automatik akaun ↔ rekod ahli
--
-- Jalankan SELEPAS 20260906000002_members.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Rekod ahli diimport dari Excel SEBELUM mana-mana akaun wujud, jadi
-- `members.user_id` adalah NULL untuk semua baris yang diimport. Kesannya
-- seorang ahli yang baru mendaftar tidak dapat membaca rekodnya sendiri:
-- policy `members_select` memerlukan `user_id = auth.uid()`, dan tiada apa
-- yang pernah menetapkan `user_id` itu. Skrin Profil betul memaparkan
-- "Profil belum dikaitkan" — yang hilang ialah langkah mengaitkannya.
-- =============================================================================


-- =============================================================================
-- 1. PENGECUALIAN UNTUK LANGKAH PAUTAN
--
-- `guard_member_admin_columns` menghalang ahli biasa mengubah `user_id` —
-- tanpa itu seorang ahli boleh mengalihkan rekod orang lain kepada dirinya.
-- Sekatan itu MESTI kekal, tetapi ia turut menghalang pautan sah di bawah.
--
-- Jalan keluarnya ialah bendera setempat-transaksi yang HANYA ditetapkan oleh
-- `link_my_member_record()`. Klien PostgREST tidak boleh memanggil
-- `set_config`, jadi bendera ini tidak boleh dipalsukan dari app; ia menandakan
-- "kemas kini ini datang dari fungsi pautan yang telah mengesahkan emel".
-- =============================================================================

create or replace function public.guard_member_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims   json := nullif(current_setting('request.jwt.claims', true), '')::json;
  jwt_role text := claims ->> 'role';
begin
  -- Tiada konteks permintaan API (SQL Editor / psql) atau service_role:
  -- ini laluan pentadbir pangkalan data, bukan pengguna app.
  if claims is null or jwt_role = 'service_role' then
    return new;
  end if;

  -- Ditetapkan oleh `link_my_member_record()` sahaja, dan hanya bagi tempoh
  -- satu transaksi.
  if coalesce(current_setting('app.member_linking', true), '') = 'on' then
    return new;
  end if;

  if public.can_edit_members(auth.uid()) then
    return new;
  end if;

  if new.nombor_ahli is distinct from old.nombor_ahli
     or new.generasi is distinct from old.generasi
     or new.email    is distinct from old.email
     or new.disekat  is distinct from old.disekat
     or new.user_id  is distinct from old.user_id then
    raise exception 'Nombor ahli, generasi, emel dan status sekatan hanya boleh diubah oleh admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


-- =============================================================================
-- 2. FUNGSI PAUTAN
--
-- Mengaitkan akaun yang sedang log masuk kepada rekod ahli yang emelnya sama.
-- Memulangkan `id` rekod yang dipautkan, atau NULL bila tiada padanan.
--
-- Keselamatan bergantung pada satu perkara: emel TIDAK diterima sebagai
-- argumen. Ia dibaca dari `auth.users` untuk `auth.uid()` sahaja, jadi
-- pemanggil tidak boleh menamakan emel orang lain untuk menuntut rekodnya.
-- =============================================================================

create or replace function public.link_my_member_record()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid := auth.uid();
  account_email text;
  matched_id    uuid;
  match_count   int;
begin
  if uid is null then
    return null;
  end if;

  -- Sudah dikaitkan — pulangkan rekod sedia ada supaya fungsi ini selamat
  -- dipanggil pada setiap kali skrin Profil dibuka.
  select id into matched_id from public.members where user_id = uid;
  if matched_id is not null then
    return matched_id;
  end if;

  /*
    `email_confirmed_at` diperiksa supaya emel yang belum disahkan tidak boleh
    menuntut rekod. Bila projek mematikan pengesahan emel, Supabase menetapkan
    lajur ini semasa pendaftaran, jadi semakan ini tidak menghalang apa-apa di
    sana — ia hanya bermakna apabila pengesahan dihidupkan.
  */
  select lower(trim(u.email))
    into account_email
  from auth.users u
  where u.id = uid
    and u.email_confirmed_at is not null;

  if account_email is null or account_email = '' then
    return null;
  end if;

  /*
    Padanan mesti TUNGGAL. Bila dua rekod belum dipautkan berkongsi emel yang
    sama, tiada cara menentukan yang mana milik pengguna ini — memilih salah
    satu secara sewenang-wenang boleh menyerahkan rekod orang lain, jadi
    keputusan diserahkan kepada admin.
  */
  select count(*)
    into match_count
  from public.members m
  where m.user_id is null
    and lower(trim(m.email)) = account_email;

  if match_count <> 1 then
    return null;
  end if;

  select id
    into matched_id
  from public.members m
  where m.user_id is null
    and lower(trim(m.email)) = account_email;

  perform set_config('app.member_linking', 'on', true);

  -- `user_id is null` diulang di sini supaya dua permintaan serentak tidak
  -- boleh merampas baris yang baru sahaja dipautkan oleh yang lain.
  update public.members
     set user_id = uid
   where id = matched_id
     and user_id is null;

  if not found then
    matched_id := null;
  end if;

  perform set_config('app.member_linking', 'off', true);

  return matched_id;
end;
$$;

revoke all on function public.link_my_member_record() from public;
grant execute on function public.link_my_member_record() to authenticated;
