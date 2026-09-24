-- =============================================================================
-- MySAFF — Peranan 'owner': lapisan pemulihan kecemasan atas Super Admin
--
-- Jalankan SELEPAS 20260925000062_owner_role_enum.sql.
--
--   * 'owner' HANYA boleh ditetapkan melalui SQL Editor / service_role — tiada
--     laluan app, RPC atau Edge Function yang boleh menetapkan atau mengubahnya.
--   * Melantik / menurunkan SUPER ADMIN kini HANYA boleh dibuat oleh Owner,
--     melalui `owner_set_super_admin()`. Super Admin biasa tidak lagi boleh.
--   * 'owner' ialah peranan BERASINGAN sepenuhnya: `is_super_admin()` dan
--     `has_department_access()` kekal menyemak `role = 'super_admin'`, jadi
--     Owner TIDAK lulus semakan admin di mana-mana tempat lain.
-- =============================================================================


-- --- is_owner() ---------------------------------------------------------------
-- Cermin `is_super_admin()`: akaun disekat / kata laluan sementara tidak lulus.

create or replace function public.is_owner(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.account_suspended(uid)
     and not public.temp_password_pending(uid)
     and exists (
       select 1
       from public.profiles p
       where p.id = uid
         and p.role = 'owner'
     );
$$;

revoke all on function public.is_owner(uuid) from public, anon;
grant execute on function public.is_owner(uuid) to authenticated;


-- --- Pengawal peranan (INSERT / UPDATE / DELETE pada profiles) ------------------
-- Laluan tanpa konteks JWT (SQL Editor) atau service_role sentiasa lulus:
-- itulah satu-satunya cara 'owner' ditetapkan.
--
-- Bagi pemanggil app:
--   - 'owner' tidak boleh dicipta, diubah, dipadam atau disunting oleh sesiapa;
--   - 'super_admin' hanya boleh dilantik / diturunkan oleh Owner yang berjalan
--     dalam `owner_set_super_admin()` (bendera transaksi `app.owner_recovery`,
--     disemak SEKALI LAGI terhadap `is_owner()` — bendera sahaja tidak cukup);
--   - peranan lain (admin <-> ahli) kekal urusan Super Admin seperti sedia ada.

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims       json := nullif(current_setting('request.jwt.claims', true), '')::json;
  jwt_role     text := claims ->> 'role';
  v_owner_flow boolean;
begin
  if claims is null or jwt_role = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_owner_flow := coalesce(current_setting('app.owner_recovery', true), '') = 'on'
                  and public.is_owner(auth.uid());

  if tg_op = 'INSERT' then
    if new.role in ('owner', 'super_admin') then
      raise exception 'Peranan ini tidak boleh ditetapkan melalui app.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role in ('owner', 'super_admin') then
      raise exception 'Profil Owner / Super Admin tidak boleh dipadam melalui app.' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.role = 'owner' and auth.uid() is distinct from old.id then
    raise exception 'Profil Owner tidak boleh diubah oleh pengguna lain.' using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    if old.role = 'owner' or new.role = 'owner' then
      raise exception 'Peranan Owner hanya boleh ditetapkan melalui SQL Editor.' using errcode = '42501';
    end if;

    if old.role = 'super_admin' or new.role = 'super_admin' then
      if not v_owner_flow then
        raise exception 'Hanya Owner boleh melantik atau menurunkan Super Admin.' using errcode = '42501';
      end if;
    elsif not public.is_super_admin(auth.uid()) then
      raise exception 'Hanya Super Admin boleh menukar peranan pengguna.' using errcode = '42501';
    end if;
  end if;

  if new.email is distinct from old.email and not public.is_super_admin(auth.uid()) then
    raise exception 'Emel profil mengikut emel akaun dan tidak boleh diubah terus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
  before insert or update or delete on public.profiles
  for each row execute function public.guard_profile_role_change();


-- --- Log aktiviti: tanda "(Pemulihan)" ------------------------------------------
-- Trigger audit sedia ada menulis "Lantik/Turunkan Super Admin"; bila bendera
-- Owner aktif, akhiran " (Pemulihan)" ditambah. Diubah di tempat supaya tiada
-- salinan 200 baris fungsi itu.

do $$
declare
  v_def text;
  v_new text;
  v_sfx constant text :=
    ' || case when coalesce(current_setting(''app.owner_recovery'', true), '''') = ''on'' then '' (Pemulihan)'' else '''' end';
begin
  v_def := pg_get_functiondef('public.audit_admin_activity()'::regprocedure);
  v_new := replace(v_def, 'then ''Lantik Super Admin''', 'then ''Lantik Super Admin''' || v_sfx);
  v_new := replace(v_new, 'then ''Turunkan Super Admin''', 'then ''Turunkan Super Admin''' || v_sfx);
  if v_new = v_def or position('(Pemulihan)' in v_new) = 0 then
    raise exception 'Gagal menampal audit_admin_activity() - teks asal tidak dijumpai.';
  end if;
  execute v_new;
end $$;


-- --- RPC Owner ------------------------------------------------------------------
-- errcode kelas 'MS' (lihat catatan dalam 20260907000013).

-- Semua Super Admin semasa. Owner sahaja (Owner tidak boleh membaca `profiles` terus).
create or replace function public.owner_list_super_admins()
returns table (profile_id uuid, member_id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Hanya Owner dibenarkan.' using errcode = 'MS001';
  end if;

  return query
    select p.id,
           m.id,
           coalesce(nullif(trim(m.full_name), ''), nullif(trim(p.full_name), ''), p.email),
           p.email
    from public.profiles p
    left join public.members m on m.user_id = p.id
    where p.role = 'super_admin'
    order by 3;
end;
$$;

-- Carian ahli (nama / nombor ahli) yang mempunyai akaun dan belum Super Admin / Owner. Maks 20.
create or replace function public.owner_search_members(p_query text)
returns table (member_id uuid, full_name text, nombor_ahli text, email text, role text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Hanya Owner dibenarkan.' using errcode = 'MS001';
  end if;

  if length(v_q) < 2 then
    return;
  end if;

  return query
    select m.id, m.full_name, m.nombor_ahli, p.email, p.role::text
    from public.members m
    join public.profiles p on p.id = m.user_id
    where p.role in ('ahli', 'admin')
      and (m.full_name ilike '%' || v_q || '%' or coalesce(m.nombor_ahli, '') ilike '%' || v_q || '%')
    order by m.full_name
    limit 20;
end;
$$;

/*
  Naik / turunkan Super Admin. `p_member_id` = `members.id`; `profiles.id` juga diterima
  (Super Admin tanpa rekod ahli). Owner sahaja. Turun pangkat menjadi 'admin' bila masih
  memegang department, jika tidak 'ahli'. Satu-satunya Super Admin tidak boleh diturunkan
  (logik sedia ada di UI, dikekalkan di sini sebagai lapisan kedua) — lantik penggantinya dahulu.
*/
create or replace function public.owner_set_super_admin(p_member_id uuid, p_make_super_admin boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_role text;
  v_next text;
begin
  if not public.is_owner(auth.uid()) then
    raise exception 'Hanya Owner boleh melantik atau menurunkan Super Admin.' using errcode = 'MS001';
  end if;

  select m.user_id into v_uid from public.members m where m.id = p_member_id;
  if v_uid is null and exists (select 1 from public.profiles p where p.id = p_member_id) then
    v_uid := p_member_id;
  end if;
  if v_uid is null then
    raise exception 'Ahli / akaun tidak dijumpai.' using errcode = 'MS002';
  end if;

  select p.role::text into v_role from public.profiles p where p.id = v_uid for update;
  if v_role is null then
    raise exception 'Akaun ini tiada profil.' using errcode = 'MS002';
  end if;
  if v_role = 'owner' then
    raise exception 'Peranan Owner tidak boleh diubah melalui app.' using errcode = 'MS003';
  end if;

  if p_make_super_admin then
    if v_role = 'super_admin' then
      raise exception 'Akaun ini sudah Super Admin.' using errcode = 'MS004';
    end if;
    v_next := 'super_admin';
  else
    if v_role <> 'super_admin' then
      raise exception 'Akaun ini bukan Super Admin.' using errcode = 'MS004';
    end if;
    if (select count(*) from public.profiles where role = 'super_admin') <= 1 then
      raise exception 'Tidak boleh diturunkan - satu-satunya Super Admin. Lantik Super Admin lain dahulu.'
        using errcode = 'MS005';
    end if;
    v_next := case
      when exists (select 1 from public.admin_assignments a where a.user_id = v_uid) then 'admin'
      else 'ahli'
    end;
  end if;

  perform set_config('app.owner_recovery', 'on', true);
  update public.profiles set role = v_next::public.user_role where id = v_uid;
  perform set_config('app.owner_recovery', 'off', true);

  return v_next;
end;
$$;

revoke all on function public.owner_list_super_admins() from public, anon;
revoke all on function public.owner_search_members(text) from public, anon;
revoke all on function public.owner_set_super_admin(uuid, boolean) from public, anon;
grant execute on function public.owner_list_super_admins() to authenticated;
grant execute on function public.owner_search_members(text) to authenticated;
grant execute on function public.owner_set_super_admin(uuid, boolean) to authenticated;
