-- mysaf-off -- Rais/Raisah Generasi + Rais/Raisah Usrah Kawasan (2026-10-05)
--
-- 1. Carta Organisasi TIDAK lagi memapar senarai naqib/naqibah "Usrah
--    Tarbiah" (arahan pemilik sistem): `list_org_chart()` ditulis semula tanpa
--    UNION naqib kumpulan usrah (migration 112/131). Data naqib dalam
--    kumpulan_usrah_naqib TIDAK disentuh -- hanya paparan carta dibuang.
--    Bahagian 'Usrah Perkaderan Sekolah' kekal.
-- 2. Table `rais_lantikan`: slot tetap (satu baris setiap generasi/kawasan +
--    peranan). Generasi i01-i06 hanya ada slot Rais; i07 ke atas Rais +
--    Raisah; setiap kawasan usrah Rais + Raisah.
-- 3. Bacaan terbuka kepada semua ahli log masuk (RPC); tulis terhad kepada
--    department JABATAN SETIAUSAHA (admin Setiausaha) + Super Admin.
--
-- NAMA SEMENTARA (DUMMY): semua slot diisi ahli pertama (ikut abjad) yang
-- sepadan jantina + generasi/kawasan, sebagai gambaran susun atur sahaja.
-- Pemilik sistem akan menggantikannya melalui skrin admin selepas muktamad.

-- 1. list_org_chart() tanpa naqib kumpulan usrah ---------------------------

create or replace function public.list_org_chart()
returns table (
  id            uuid,
  bahagian      text,
  jawatan       text,
  display_order integer,
  member_id     uuid,
  full_name     text,
  generasi      text,
  avatar_url    text
)
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select
      p.id, p.bahagian, p.jawatan, p.display_order, p.member_id,
      m.full_name, m.generasi, m.avatar_url
    from public.org_positions p
    left join public.members m on m.id = p.member_id

    union all

    select
      pa.id,
      'Usrah Perkaderan Sekolah'::text as bahagian,
      (case when m.jantina = 'Muslimat' then 'Naqibah Usrah Perkaderan Sekolah' else 'Naqib Usrah Perkaderan Sekolah' end)::text as jawatan,
      (2000000 + row_number() over (order by m.full_name))::integer as display_order,
      pa.member_id,
      m.full_name, m.generasi, m.avatar_url
    from public.perkaderan_naqib_assignments pa
    join public.members m on m.id = pa.member_id
    where pa.is_active
  )
  select * from rows
  where auth.uid() is not null
  order by display_order, id;
$$;

-- 2. Table + slot -------------------------------------------------------------

create table if not exists public.rais_lantikan (
  id         uuid primary key default gen_random_uuid(),
  jenis      text not null check (jenis in ('generasi', 'kawasan')),
  kod        text not null,
  peranan    text not null check (peranan in ('rais', 'raisah')),
  member_id  uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (jenis, kod, peranan)
);

alter table public.rais_lantikan enable row level security;
revoke all on table public.rais_lantikan from anon, authenticated;
-- Tiada policy: semua akses melalui RPC security definer di bawah.

insert into public.rais_lantikan (jenis, kod, peranan)
select 'generasi', g.code, 'rais' from public.generations g
on conflict do nothing;

insert into public.rais_lantikan (jenis, kod, peranan)
select 'generasi', g.code, 'raisah' from public.generations g
where g.code >= 'i07'
on conflict do nothing;

insert into public.rais_lantikan (jenis, kod, peranan)
select 'kawasan', k.kod, p.peranan
from (values ('US'),('ULK'),('UU'),('UPT'),('UT'),('UTS'),('UA-UB'),('UP')) as k(kod)
cross join (values ('rais'),('raisah')) as p(peranan)
on conflict do nothing;

-- Nama dummy (lihat nota di atas). Hanya slot yang masih kosong.
update public.rais_lantikan r
   set member_id = (
     select m.id from public.members m
      where not m.disekat
        and m.jantina = case r.peranan when 'rais' then 'Muslimin' else 'Muslimat' end
        and ((r.jenis = 'generasi' and m.generasi = r.kod)
          or (r.jenis = 'kawasan'  and m.kawasan_usrah = r.kod))
      order by m.full_name
      limit 1)
 where r.member_id is null;

-- 3. Akses ----------------------------------------------------------------------

create or replace function public.can_edit_rais_lantikan(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('JABATAN SETIAUSAHA', true, uid);
$$;
revoke all on function public.can_edit_rais_lantikan(uuid) from public, anon;
grant execute on function public.can_edit_rais_lantikan(uuid) to authenticated;

create or replace function public.list_rais_lantikan()
returns table (
  id            uuid,
  jenis         text,
  kod           text,
  peranan       text,
  member_id     uuid,
  full_name     text,
  generasi      text,
  avatar_url    text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.jenis, r.kod, r.peranan, r.member_id, m.full_name, m.generasi, m.avatar_url
  from public.rais_lantikan r
  left join public.members m on m.id = r.member_id
  where auth.uid() is not null
  order by
    r.jenis,
    case when r.jenis = 'kawasan'
      then coalesce(array_position(array['US','ULK','UU','UPT','UT','UTS','UA-UB','UP'], r.kod), 99)
      else 0 end,
    r.kod,
    case r.peranan when 'rais' then 0 else 1 end;
$$;
revoke all on function public.list_rais_lantikan() from public, anon;
grant execute on function public.list_rais_lantikan() to authenticated;

create or replace function public.rais_member_options()
returns table (
  id            uuid,
  full_name     text,
  generasi      text,
  avatar_url    text,
  jantina       text,
  kawasan_usrah text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.full_name, m.generasi, m.avatar_url, m.jantina, m.kawasan_usrah
  from public.members m
  where public.can_edit_rais_lantikan() and not m.disekat
  order by m.full_name;
$$;
revoke all on function public.rais_member_options() from public, anon;
grant execute on function public.rais_member_options() to authenticated;

create or replace function public.set_rais_lantikan(p_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peranan text;
  v_jantina text;
begin
  if not public.can_edit_rais_lantikan() then
    raise exception 'Tiada kebenaran mengubah lantikan Rais/Raisah.' using errcode = '42501';
  end if;

  select peranan into v_peranan from public.rais_lantikan where id = p_id;
  if v_peranan is null then
    raise exception 'Slot lantikan tidak dijumpai.';
  end if;

  if p_member_id is not null then
    select jantina into v_jantina from public.members where id = p_member_id and not disekat;
    if v_jantina is null then
      raise exception 'Ahli tidak dijumpai.';
    end if;
    if v_peranan = 'rais' and v_jantina <> 'Muslimin' then
      raise exception 'Rais mesti seorang Muslimin.';
    end if;
    if v_peranan = 'raisah' and v_jantina <> 'Muslimat' then
      raise exception 'Raisah mesti seorang Muslimat.';
    end if;
  end if;

  update public.rais_lantikan set member_id = p_member_id, updated_at = now() where id = p_id;
end;
$$;
revoke all on function public.set_rais_lantikan(uuid, uuid) from public, anon;
grant execute on function public.set_rais_lantikan(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
