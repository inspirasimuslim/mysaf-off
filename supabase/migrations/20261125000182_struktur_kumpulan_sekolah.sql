-- Struktur kumpulan: sekolah (senarai diurus admin) > tingkatan 3-5 > kumpulan 1-10 > naqib (2026-11-25)
create table if not exists public.perkaderan_sekolah (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null check (char_length(nama) between 2 and 120),
  created_at timestamptz not null default now()
);
create unique index if not exists perkaderan_sekolah_nama_uidx on public.perkaderan_sekolah (lower(nama));
alter table public.perkaderan_sekolah enable row level security;
drop policy if exists perkaderan_sekolah_select on public.perkaderan_sekolah;
create policy perkaderan_sekolah_select on public.perkaderan_sekolah for select to authenticated
  using (public.is_super_admin() or public.can_view_perkaderan() or public.is_active_naqib());
drop policy if exists perkaderan_sekolah_write on public.perkaderan_sekolah;
create policy perkaderan_sekolah_write on public.perkaderan_sekolah for all to authenticated
  using (public.is_super_admin() or public.can_edit_perkaderan())
  with check (public.is_super_admin() or public.can_edit_perkaderan());
revoke all on public.perkaderan_sekolah from anon;
revoke truncate, references, trigger on public.perkaderan_sekolah from authenticated;
insert into public.perkaderan_sekolah (nama) values
  ('SMKA FALAHIAH'),('SMKA NAIM LILBANAT'),('SMKA TOK BACHOK'),('MAAHAD MUHAMMADI PASIR MAS'),
  ('MAAHAD AMIR INDERA PETRA'),('SMA TG AMALIN AISYAH'),('SMK KOTA DAMANSARA')
on conflict do nothing;

alter table public.sekolah_usrah_groups
  add column if not exists tingkatan text check (tingkatan is null or tingkatan in ('Tingkatan 3','Tingkatan 4','Tingkatan 5')),
  add column if not exists no_kumpulan integer check (no_kumpulan is null or no_kumpulan between 1 and 10);
-- Satu slot (sekolah, tingkatan, no. kumpulan) hanya satu kumpulan aktif.
create unique index if not exists sekolah_usrah_groups_slot_uidx
  on public.sekolah_usrah_groups (sekolah, tingkatan, no_kumpulan) where is_active and tingkatan is not null and no_kumpulan is not null;

-- Isi semula kumpulan yang diimport: tingkatan daripada mad'u, nombor ikut senarai asal fail kehadiran.
update public.sekolah_usrah_groups g set tingkatan = (
  select m.tingkatan from public.sekolah_usrah_mad_u m where m.group_id = g.id and m.tingkatan in ('Tingkatan 3','Tingkatan 4','Tingkatan 5') limit 1)
 where g.tingkatan is null;
update public.sekolah_usrah_groups g set no_kumpulan = v.n
  from (values ('8d2bf262-742b-45b3-a79e-ef2bf069a128'::uuid,1),('a9eb107f-8567-4330-ba21-fd95ecab2084'::uuid,2),('769642c7-953d-4e63-a976-08dc2029c282'::uuid,3),('e25857a7-df34-4ef9-871d-16d6453a217e'::uuid,4),('2e0677f7-2e25-4ce7-bb4b-43af11248e29'::uuid,5),('bd4025ef-c0a9-4b22-a068-79433e33ba03'::uuid,7),('4b64d98c-0b83-4b8f-b07a-afa072df8f04'::uuid,1),('a560f26a-f313-41e0-bc44-b4634aa31231'::uuid,2),('53eb126b-1bf7-4742-b666-dbba16fa58f6'::uuid,3),('033c25ca-099b-4816-beb3-689888469bc2'::uuid,4),('9fe436b1-1cc4-479d-9f45-fda951b92516'::uuid,1),('6f00bec4-b76a-442f-973f-ffc6ca323245'::uuid,2),('d8b34712-e8ba-4ad8-9e85-b9838b5d745c'::uuid,3),('49005453-e3e8-4e34-9d4f-bef75424c12d'::uuid,4),('62b6b559-10f4-4a01-9552-15140a372352'::uuid,5),('b1c6cd4f-c0e2-446c-bde2-1119b2ce4565'::uuid,1),('ed3bded0-a517-4d0a-85fa-3eea5182b22f'::uuid,2),('e4e90bc6-f397-45f0-86d2-e46fb8a6acdf'::uuid,3),('0fc93c72-1780-4eae-8f0b-cd06bb47a487'::uuid,4),('f97dff97-5576-4433-a5ce-39165c3ee57b'::uuid,5)) as v(id, n) where g.id = v.id and g.no_kumpulan is null;

create or replace function public.sekolah_usrah_set_group_name()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_naqib_name text;
begin
  select full_name into v_naqib_name from public.members where id = new.naqib_member_id;
  new.group_name := 'Usrah ' || new.sekolah
    || case when new.tingkatan is not null and new.no_kumpulan is not null
            then ' ' || replace(new.tingkatan, 'Tingkatan ', 'T') || ' K' || new.no_kumpulan else '' end
    || ' - ' || coalesce(v_naqib_name, 'Naqib');
  return new;
end $$;
drop trigger if exists sekolah_usrah_groups_set_name on public.sekolah_usrah_groups;
create trigger sekolah_usrah_groups_set_name
  before insert or update of sekolah, naqib_member_id, tingkatan, no_kumpulan on public.sekolah_usrah_groups
  for each row execute function public.sekolah_usrah_set_group_name();
update public.sekolah_usrah_groups set sekolah = sekolah;  -- segarkan group_name

-- Slot kumpulan sesebuah sekolah (dengan nama naqib) untuk skrin pelantikan.
create or replace function public.perkaderan_slots(p_sekolah text)
returns table (group_id uuid, tingkatan text, no_kumpulan integer, naqib_id uuid, naqib_nama text,
               partner_id uuid, partner_nama text, madu integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Tiada kebenaran.' using errcode = '42501';
  end if;
  return query
  select g.id, g.tingkatan, g.no_kumpulan, g.naqib_member_id, n.full_name,
         g.default_partner_naqib_member_id, p.full_name,
         (select count(*)::int from public.sekolah_usrah_mad_u m where m.group_id = g.id and m.is_active)
    from public.sekolah_usrah_groups g
    join public.members n on n.id = g.naqib_member_id
    left join public.members p on p.id = g.default_partner_naqib_member_id
   where g.is_active and g.sekolah = p_sekolah
   order by g.tingkatan, g.no_kumpulan;
end $$;
revoke all on function public.perkaderan_slots(text) from public, anon;
grant execute on function public.perkaderan_slots(text) to authenticated;

-- Lantik naqib (dan rakan setaraf) ke satu slot. Cipta kumpulan jika belum ada; jika sudah ada, tukar naqibnya.
-- Naqib yang belum dilantik dilantik serentak (lantikan aktif sedia ada dikekalkan).
create or replace function public.perkaderan_slot_assign(p_sekolah text, p_tingkatan text, p_no integer, p_naqib uuid, p_partner uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid(); m uuid;
begin
  if not (public.is_super_admin() or public.can_edit_perkaderan()) then
    raise exception 'Tiada kebenaran melantik naqib.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perkaderan_sekolah where nama = p_sekolah) then
    raise exception 'Sekolah tiada dalam senarai.';
  end if;
  if p_tingkatan not in ('Tingkatan 3','Tingkatan 4','Tingkatan 5') or p_no not between 1 and 10 then
    raise exception 'Tingkatan atau nombor kumpulan tidak sah.';
  end if;
  if p_partner is not null and p_partner = p_naqib then
    raise exception 'Naqib kedua mesti orang lain.';
  end if;
  foreach m in array array[p_naqib, p_partner] loop
    if m is not null and not exists (select 1 from public.perkaderan_naqib_assignments where member_id = m and is_active) then
      insert into public.perkaderan_naqib_assignments(member_id, assigned_by) values (m, v_uid);
    end if;
  end loop;
  select id into v_id from public.sekolah_usrah_groups
   where is_active and sekolah = p_sekolah and tingkatan = p_tingkatan and no_kumpulan = p_no;
  if v_id is null then
    insert into public.sekolah_usrah_groups(naqib_member_id, default_partner_naqib_member_id, sekolah, tingkatan, no_kumpulan)
    values (p_naqib, p_partner, p_sekolah, p_tingkatan, p_no) returning id into v_id;
  else
    update public.sekolah_usrah_groups set naqib_member_id = p_naqib, default_partner_naqib_member_id = p_partner where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.perkaderan_slot_assign(text, text, integer, uuid, uuid) from public, anon;
grant execute on function public.perkaderan_slot_assign(text, text, integer, uuid, uuid) to authenticated;

-- Buang sekolah dari senarai — ditolak jika masih ada kumpulan aktif.
create or replace function public.perkaderan_sekolah_padam(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_nama text;
begin
  if not (public.is_super_admin() or public.can_edit_perkaderan()) then
    raise exception 'Tiada kebenaran.' using errcode = '42501';
  end if;
  select nama into v_nama from public.perkaderan_sekolah where id = p_id;
  if v_nama is null then return; end if;
  if exists (select 1 from public.sekolah_usrah_groups where is_active and sekolah = v_nama) then
    raise exception 'Sekolah ini masih ada kumpulan aktif. Buang atau arkibkan kumpulannya dahulu.';
  end if;
  delete from public.perkaderan_sekolah where id = p_id;
end $$;
revoke all on function public.perkaderan_sekolah_padam(uuid) from public, anon;
grant execute on function public.perkaderan_sekolah_padam(uuid) to authenticated;
notify pgrst, 'reload schema';
