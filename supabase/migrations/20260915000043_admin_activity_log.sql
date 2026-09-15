-- =============================================================================
-- MySAFF — Log Aktiviti Admin
--
-- Jalankan SELEPAS 20260915000042_member_self_updated_at.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Jejak automatik tindakan admin merentasi sistem. Super Admin sahaja boleh
-- membacanya; TIADA sesiapa boleh menulis terus. Tulisan datang daripada dua
-- laluan sahaja:
--   1. Trigger `audit_admin_activity()` (SECURITY DEFINER) pada table yang
--      diurus admin melalui app.
--   2. Edge Function (service_role) yang memanggil `log_admin_activity()`
--      secara eksplisit dengan `p_actor_id` — di situ `auth.uid()` kosong.
--
-- Trigger TIDAK merekod apa-apa bila tiada sesi pengguna (SQL Editor, psql,
-- service_role). Tulisan service_role datang daripada Edge Function yang
-- sudah merekod tindakannya sendiri; merekodnya sekali lagi dari trigger akan
-- menghasilkan baris pendua tanpa nama pelaku.
--
-- `details` sengaja ringkas: `label` (rujukan boleh baca — nama, nombor ahli,
-- tajuk) dan, untuk kemas kini, NAMA kolum yang berubah (`diubah`) — bukan
-- nilainya. NRIC, alamat dan pendapatan tidak pernah disalin ke dalam log.
-- =============================================================================

create table if not exists public.admin_activity_log (
  id          uuid primary key default gen_random_uuid(),
  -- `set null`: memadam akaun admin tidak boleh memadam jejak tindakannya.
  actor_id    uuid references auth.users (id) on delete set null,
  -- Salinan nama pada masa tindakan — kekal walaupun nama ditukar kemudian.
  actor_name  text not null,
  action      text not null,
  target_type text not null,
  target_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_activity_log_created_at_idx
  on public.admin_activity_log (created_at desc);
create index if not exists admin_activity_log_actor_idx
  on public.admin_activity_log (actor_id);

alter table public.admin_activity_log enable row level security;

drop policy if exists admin_activity_log_select on public.admin_activity_log;
create policy admin_activity_log_select
  on public.admin_activity_log
  for select
  to authenticated
  using (public.is_super_admin());

-- Tiada polisi INSERT/UPDATE/DELETE bermakna RLS menolak semuanya; hak table
-- ditarik juga supaya penolakan itu tidak bergantung pada RLS seorang diri.
revoke insert, update, delete, truncate on public.admin_activity_log from public, anon, authenticated;
grant select on public.admin_activity_log to authenticated;

-- --- Pembantu ----------------------------------------------------------------

/** Nama paparan satu akaun: rekod ahli > profil > emel. */
create or replace function public._audit_user_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(trim(m.full_name), '') from public.members m where m.user_id = p_uid limit 1),
    (select coalesce(nullif(trim(p.full_name), ''), p.email) from public.profiles p where p.id = p_uid),
    'Tidak diketahui'
  );
$$;

/** "0123 · NAMA PENUH" bagi satu rekod ahli. */
create or replace function public._audit_member_label(p_member_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select concat_ws(' · ', m.nombor_ahli, m.full_name)
  from public.members m
  where m.id = p_member_id;
$$;

/** Kunci yang nilainya berbeza antara dua baris, kecuali yang diabaikan. */
create or replace function public._audit_changed_keys(p_old jsonb, p_new jsonb, p_ignore text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(k order by k), '{}')
  from jsonb_object_keys(p_new) as k
  where not (k = any (p_ignore))
    and (p_new -> k) is distinct from (p_old -> k);
$$;

revoke all on function public._audit_user_name(uuid) from public, anon, authenticated;
revoke all on function public._audit_member_label(uuid) from public, anon, authenticated;
revoke all on function public._audit_changed_keys(jsonb, jsonb, text[]) from public, anon, authenticated;

-- --- Penulis tunggal -----------------------------------------------------------

drop function if exists public.log_admin_activity(text, text, text, jsonb);

/*
  `p_actor_id` hanya digunakan bila `auth.uid()` kosong — iaitu Edge Function
  yang memanggil sebagai service_role. Dari sesi pengguna, uid sesi sentiasa
  menang, jadi nilai yang dihantar tidak boleh menyamar sebagai orang lain.
  Hak EXECUTE hanya untuk service_role; trigger memanggilnya sebagai pemilik.
*/
create or replace function public.log_admin_activity(
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_details     jsonb default null,
  p_actor_id    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_actor_id);
begin
  if v_actor is null then
    return;
  end if;

  insert into public.admin_activity_log (actor_id, actor_name, action, target_type, target_id, details)
  values (v_actor, public._audit_user_name(v_actor), p_action, p_target_type, p_target_id, p_details);
end;
$$;

revoke all on function public.log_admin_activity(text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.log_admin_activity(text, text, text, jsonb, uuid) to service_role;

-- --- Trigger -----------------------------------------------------------------

create or replace function public.audit_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_old     jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new     jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row     jsonb := coalesce(v_new, v_old);
  v_verb    text := case tg_op when 'INSERT' then 'Cipta' when 'UPDATE' then 'Kemaskini' else 'Padam' end;
  v_changed text[] := '{}';
  v_action  text;
  v_target  text := v_row ->> 'id';
  v_details jsonb := '{}'::jsonb;
  v_noun    text;
begin
  -- Tiada sesi pengguna: SQL Editor / service_role. Lihat kepala fail.
  if v_uid is null then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    v_changed := public._audit_changed_keys(v_old, v_new, array['updated_at', 'self_updated_at']);
    -- Simpan tanpa perubahan sebenar bukan aktiviti.
    if cardinality(v_changed) = 0 then
      return null;
    end if;
    v_details := jsonb_build_object('diubah', to_jsonb(v_changed));
  end if;

  case tg_table_name
    when 'departments' then
      v_action := v_verb || ' Department';
      v_details := v_details || jsonb_build_object('label', v_row ->> 'name');

    when 'generations' then
      v_action := v_verb || ' Generasi';
      v_details := v_details || jsonb_build_object('label', coalesce(v_row ->> 'label', v_row ->> 'code'));

    when 'admin_assignments' then
      v_action := case tg_op when 'INSERT' then 'Lantik Admin' when 'UPDATE' then 'Ubah Kebenaran Admin' else 'Buang Admin' end;
      v_details := v_details || jsonb_build_object(
        'label', concat_ws(' · ',
          public._audit_user_name((v_row ->> 'user_id')::uuid),
          (select d.name from public.departments d where d.id = (v_row ->> 'department_id')::uuid)),
        'can_view', (v_row ->> 'can_view')::boolean,
        'can_edit', (v_row ->> 'can_edit')::boolean
      );

    when 'profiles' then
      if tg_op <> 'UPDATE' or not ('role' = any (v_changed)) then
        return null;
      end if;
      v_action := case
        when v_new ->> 'role' = 'super_admin' then 'Lantik Super Admin'
        when v_old ->> 'role' = 'super_admin' then 'Turunkan Super Admin'
        else 'Tukar Peranan'
      end;
      v_details := jsonb_build_object(
        'label', public._audit_user_name((v_row ->> 'id')::uuid),
        'dari', v_old ->> 'role',
        'kepada', v_new ->> 'role'
      );

    when 'usrah_events' then
      v_noun := case when v_row ->> 'event_type' = 'usrah' then 'Usrah' else 'Program' end;
      v_action := case
        when tg_op = 'UPDATE' and v_old ->> 'archived_at' is null and v_new ->> 'archived_at' is not null then 'Arkib ' || v_noun
        when tg_op = 'UPDATE' and v_old ->> 'archived_at' is not null and v_new ->> 'archived_at' is null then 'Pulihkan ' || v_noun
        else v_verb || ' ' || v_noun
      end;
      v_details := v_details || jsonb_build_object('label', v_row ->> 'name', 'event_type', v_row ->> 'event_type');

    when 'announcements' then
      v_action := v_verb || ' Pengumuman';
      v_details := v_details || jsonb_build_object('label', v_row ->> 'title');

    when 'adhoc_payment_types' then
      v_action := v_verb || ' Pembayaran Adhoc';
      v_details := v_details || jsonb_build_object('label', v_row ->> 'title');

    when 'yuran_payments', 'pipis_contributions' then
      if coalesce(v_row ->> 'method', '') <> 'manual_adjustment' then
        return null;
      end if;
      v_noun := case tg_table_name when 'yuran_payments' then 'Yuran' else 'PIPIS' end;
      v_action := case tg_op
        when 'INSERT' then 'Pelarasan ' || v_noun
        when 'UPDATE' then 'Kemaskini Pelarasan ' || v_noun
        else 'Padam Pelarasan ' || v_noun
      end;
      v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
        'label', public._audit_member_label((v_row ->> 'member_id')::uuid),
        'tahun', (v_row ->> 'year')::int,
        'amaun', (v_row ->> 'amount')::numeric,
        'nota', v_row ->> 'note'
      ));

    when 'org_positions' then
      /*
        `org_chart_reorder()` mengemas kini `display_order` puluhan baris dalam
        SATU transaksi. Satu tindakan susun semula = satu baris log, bukan
        satu baris bagi setiap jawatan yang beralih.
      */
      if tg_op = 'UPDATE' and v_changed = array['display_order'] then
        if coalesce(current_setting('app.audit_org_reorder', true), '') = 'on' then
          return null;
        end if;
        perform set_config('app.audit_org_reorder', 'on', true);
        v_action := 'Susun Semula Carta Organisasi';
        v_target := null;
        v_details := jsonb_build_object('label', 'Susunan jawatan');
      else
        v_action := 'Kemaskini Carta Organisasi';
        v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
          'operasi', case tg_op when 'INSERT' then 'Tambah jawatan' when 'UPDATE' then 'Ubah jawatan' else 'Padam jawatan' end,
          'label', concat_ws(' · ', v_row ->> 'bahagian', v_row ->> 'jawatan'),
          'pemegang', public._audit_member_label((v_row ->> 'member_id')::uuid)
        ));
      end if;

    when 'members' then
      if tg_op <> 'UPDATE' then
        return null;
      end if;
      -- Laluan yang DIMULAKAN oleh ahli sendiri melalui RPC (pautan akaun,
      -- tukar kata laluan) — bukan tindakan admin.
      if coalesce(current_setting('app.member_linking', true), '') = 'on'
         or coalesce(current_setting('app.password_change', true), '') = 'on' then
        return null;
      end if;
      -- Sama seperti `track_member_self_update()`: uid sesi = pemilik rekod
      -- bermakna suntingan diri sendiri. `user_id` kosong (rekod belum
      -- dipautkan) tidak pernah sama, jadi suntingan admin ke atasnya dikira.
      if v_uid = (v_old ->> 'user_id')::uuid then
        return null;
      end if;
      v_action := case
        when 'disekat' = any (v_changed) and (v_new ->> 'disekat')::boolean then 'Sekat Ahli'
        when 'disekat' = any (v_changed) then 'Buka Sekatan Ahli'
        when v_changed && array['nombor_ahli', 'generasi', 'email'] then 'Kemaskini Maklumat Keahlian'
        else 'Kemaskini Profil Ahli'
      end;
      v_details := v_details || jsonb_build_object(
        'label', concat_ws(' · ', v_new ->> 'nombor_ahli', v_new ->> 'full_name')
      );

    else
      return null;
  end case;

  perform public.log_admin_activity(v_action, tg_table_name, v_target, v_details);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'departments', 'generations', 'admin_assignments', 'usrah_events', 'announcements',
    'yuran_payments', 'pipis_contributions', 'adhoc_payment_types', 'org_positions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit_admin_activity', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_admin_activity()',
      t || '_audit_admin_activity', t
    );
  end loop;

  -- Ahli dan profil: KEMAS KINI sahaja. Cipta/padam ahli melalui Edge Function
  -- (dilog di sana); profil dicipta oleh trigger pendaftaran Auth.
  foreach t in array array['members', 'profiles'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit_admin_activity', t);
    execute format(
      'create trigger %I after update on public.%I for each row execute function public.audit_admin_activity()',
      t || '_audit_admin_activity', t
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
