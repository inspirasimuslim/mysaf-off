-- =============================================================================
-- MySAFF — Super Admin boleh melantik / menurunkan Super Admin lain semula
--
-- Jalankan SELEPAS 20260928000068. Idempotent.
--
-- 20260925000063 menjadikan lantik/turun Super Admin eksklusif Owner. Kini
-- Super Admin biasa boleh melakukannya semula melalui laluan app biasa.
--
-- KEKAL ketat:
--   * 'owner' tidak boleh dicipta / diubah / dipadam oleh sesiapa melalui app;
--     profil Owner tidak boleh diubah pengguna lain.
--   * Satu-satunya Super Admin tidak boleh diturunkan (kini dikuatkuasakan di
--     pangkalan data untuk SEMUA laluan app, bukan UI sahaja).
--   * INSERT / DELETE profil Super Admin melalui app kekal ditolak.
--   * `owner_set_super_admin()` kekal — laluan pemulihan kecemasan Owner.
--
-- Log aktiviti: laluan biasa direkod "Lantik/Turunkan Super Admin" tanpa
-- akhiran; "(Pemulihan)" hanya bila bendera `app.owner_recovery` aktif (Owner).
-- =============================================================================

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

    -- Melantik / menurunkan Super Admin: Super Admin atau Owner (laluan pemulihan).
    if old.role = 'super_admin' or new.role = 'super_admin' then
      if not (v_owner_flow or public.is_super_admin(auth.uid())) then
        raise exception 'Hanya Super Admin boleh melantik atau menurunkan Super Admin.' using errcode = '42501';
      end if;

      if old.role = 'super_admin'
         and (select count(*) from public.profiles where role = 'super_admin') <= 1 then
        raise exception 'Tidak boleh diturunkan - satu-satunya Super Admin. Lantik Super Admin lain dahulu.'
          using errcode = '42501';
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
