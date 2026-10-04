-- =============================================================================
-- mysaf-off — Kumpulan Usrah Tarbiah (naqib kumpulan, pemantauan)
--
-- Diminta 2026-10-04: kawasan besar (ULK, UPT, dll.) mempunyai beberapa
-- kumpulan usrah, setiap kumpulan ada 1-2 naqib/naqibah. Admin LAJNAH TARBIAH
-- (department sedia ada yang memiliki usrah_events/usrah_monthly_attendance —
-- can_view_usrah()/can_edit_usrah(), 20260906000008_usrah_monthly_attendance.sql)
-- tentukan berapa kumpulan dan siapa naqib setiap satu; ahli boleh
-- ditambah/dibuang daripada kumpulan.
--
-- Table BAHARU, tiada data sedia ada disentuh — tiada snapshot diperlukan.
--
-- Konsequen wajib (diminta serentak, bukan skop tambahan):
--   1. Naqib kumpulan usrah tarbiah MESTI muncul dalam Carta Organisasi.
--   2. Naqib/Naqibah Usrah Perkaderan Sekolah (`perkaderan_naqib_assignments`,
--      sistem BERASINGAN sepenuhnya — lihat 20260922000050_sekolah_usrah.sql)
--      JUGA mesti muncul, walaupun sistem itu tidak disentuh di sini.
-- Kedua-dua diselesaikan dengan menjana baris VIRTUAL dalam `list_org_chart()`
-- (UNION, bukan menulis ke `org_positions` sebenar) — carta kekal SATU sumber
-- bacaan, tetapi pemilikan data (siapa naqib) kekal pada LAJNAH TARBIAH/LAJNAH
-- PERKADERAN masing-masing, BUKAN SETIAUSAHA (pemilik `org_positions`). Admin
-- SETIAUSAHA tidak boleh memadam/alih baris ini — `org_chart_reorder()` dan
-- padam terus beroperasi pada table `org_positions`, baris virtual tidak wujud
-- di situ jadi cubaan menyusunnya tidak memberi kesan (bukan ralat, hanya
-- tidak melakukan apa-apa).
-- =============================================================================


-- 1. TABLE ------------------------------------------------------------------

create table if not exists public.kumpulan_usrah (
  id            uuid primary key default gen_random_uuid(),
  kawasan_usrah text not null check (kawasan_usrah in ('US','ULK','UU','UPT','UT','UTS','UB','UA')),
  nama          text not null check (length(btrim(nama)) > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Nama kumpulan unik dalam kawasan yang sama (bukan merentas kawasan — dua
-- kawasan boleh ada kumpulan bernama sama, cth "Kumpulan 1").
create unique index if not exists kumpulan_usrah_kawasan_nama_uniq
  on public.kumpulan_usrah (kawasan_usrah, lower(btrim(nama)));

drop trigger if exists kumpulan_usrah_set_updated_at on public.kumpulan_usrah;
create trigger kumpulan_usrah_set_updated_at
  before update on public.kumpulan_usrah
  for each row execute function public.set_updated_at();

create table if not exists public.kumpulan_usrah_members (
  id          uuid primary key default gen_random_uuid(),
  kumpulan_id uuid not null references public.kumpulan_usrah (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Seorang ahli hanya dalam SATU kumpulan usrah pada satu masa — "pindah"
  -- dibuat dengan upsert (lihat kumpulan_usrah_set_member() di bawah), bukan
  -- buang-dahulu-tambah-kemudian.
  unique (member_id)
);
create index if not exists kumpulan_usrah_members_kumpulan_idx on public.kumpulan_usrah_members (kumpulan_id);

create table if not exists public.kumpulan_usrah_naqib (
  id          uuid primary key default gen_random_uuid(),
  kumpulan_id uuid not null references public.kumpulan_usrah (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (kumpulan_id, member_id)
);
create index if not exists kumpulan_usrah_naqib_kumpulan_idx on public.kumpulan_usrah_naqib (kumpulan_id);

-- Had 2 naqib setiap kumpulan — dikuatkuasakan di DB supaya tiada laluan
-- (termasuk import pukal) boleh memintasnya.
create or replace function public.kumpulan_usrah_naqib_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.kumpulan_usrah_naqib where kumpulan_id = new.kumpulan_id) >= 2 then
    raise exception 'Kumpulan usrah ini sudah ada 2 naqib (had maksimum setiap kumpulan).' using errcode = 'P0010';
  end if;
  return new;
end;
$$;

drop trigger if exists kumpulan_usrah_naqib_cap_trg on public.kumpulan_usrah_naqib;
create trigger kumpulan_usrah_naqib_cap_trg
  before insert on public.kumpulan_usrah_naqib
  for each row execute function public.kumpulan_usrah_naqib_cap();


-- 2. RLS ----------------------------------------------------------------------
--
-- Pemantauan dalaman LAJNAH TARBIAH — TIDAK terbuka kepada semua ahli
-- (berbeza daripada carta organisasi); can_view_usrah()/can_edit_usrah() sudah
-- merangkumi Super Admin.

alter table public.kumpulan_usrah enable row level security;
alter table public.kumpulan_usrah_members enable row level security;
alter table public.kumpulan_usrah_naqib enable row level security;

revoke all on table public.kumpulan_usrah from anon;
revoke all on table public.kumpulan_usrah_members from anon;
revoke all on table public.kumpulan_usrah_naqib from anon;

drop policy if exists kumpulan_usrah_select on public.kumpulan_usrah;
create policy kumpulan_usrah_select on public.kumpulan_usrah
  for select to authenticated using (public.can_view_usrah());
drop policy if exists kumpulan_usrah_insert on public.kumpulan_usrah;
create policy kumpulan_usrah_insert on public.kumpulan_usrah
  for insert to authenticated with check (public.can_edit_usrah());
drop policy if exists kumpulan_usrah_update on public.kumpulan_usrah;
create policy kumpulan_usrah_update on public.kumpulan_usrah
  for update to authenticated using (public.can_edit_usrah()) with check (public.can_edit_usrah());
drop policy if exists kumpulan_usrah_delete on public.kumpulan_usrah;
create policy kumpulan_usrah_delete on public.kumpulan_usrah
  for delete to authenticated using (public.can_edit_usrah());

drop policy if exists kumpulan_usrah_members_select on public.kumpulan_usrah_members;
create policy kumpulan_usrah_members_select on public.kumpulan_usrah_members
  for select to authenticated using (public.can_view_usrah());
drop policy if exists kumpulan_usrah_members_insert on public.kumpulan_usrah_members;
create policy kumpulan_usrah_members_insert on public.kumpulan_usrah_members
  for insert to authenticated with check (public.can_edit_usrah());
drop policy if exists kumpulan_usrah_members_update on public.kumpulan_usrah_members;
create policy kumpulan_usrah_members_update on public.kumpulan_usrah_members
  for update to authenticated using (public.can_edit_usrah()) with check (public.can_edit_usrah());
drop policy if exists kumpulan_usrah_members_delete on public.kumpulan_usrah_members;
create policy kumpulan_usrah_members_delete on public.kumpulan_usrah_members
  for delete to authenticated using (public.can_edit_usrah());

drop policy if exists kumpulan_usrah_naqib_select on public.kumpulan_usrah_naqib;
create policy kumpulan_usrah_naqib_select on public.kumpulan_usrah_naqib
  for select to authenticated using (public.can_view_usrah());
drop policy if exists kumpulan_usrah_naqib_insert on public.kumpulan_usrah_naqib;
create policy kumpulan_usrah_naqib_insert on public.kumpulan_usrah_naqib
  for insert to authenticated with check (public.can_edit_usrah());
drop policy if exists kumpulan_usrah_naqib_delete on public.kumpulan_usrah_naqib;
create policy kumpulan_usrah_naqib_delete on public.kumpulan_usrah_naqib
  for delete to authenticated using (public.can_edit_usrah());


-- 3. BACAAN PENUH (admin) ------------------------------------------------------
--
-- `security definer` atas sebab sama seperti `list_org_chart()` —
-- admin LAJNAH TARBIAH belum tentu ada can_view_members(), tetapi perlu nama
-- ahli/naqib untuk paparan.

create or replace function public.kumpulan_usrah_overview()
returns table (
  id            uuid,
  kawasan_usrah text,
  nama          text,
  created_at    timestamptz,
  ahli          jsonb,
  naqib         jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ku.id, ku.kawasan_usrah, ku.nama, ku.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', kum.id, 'member_id', m.id, 'full_name', m.full_name, 'generasi', m.generasi) order by m.full_name)
      from public.kumpulan_usrah_members kum
      join public.members m on m.id = kum.member_id
      where kum.kumpulan_id = ku.id
    ), '[]'::jsonb) as ahli,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', kn.id, 'member_id', m.id, 'full_name', m.full_name, 'generasi', m.generasi) order by m.full_name)
      from public.kumpulan_usrah_naqib kn
      join public.members m on m.id = kn.member_id
      where kn.kumpulan_id = ku.id
    ), '[]'::jsonb) as naqib
  from public.kumpulan_usrah ku
  where public.can_view_usrah()
  order by ku.kawasan_usrah, ku.nama;
$$;

revoke all on function public.kumpulan_usrah_overview() from public, anon;
grant execute on function public.kumpulan_usrah_overview() to authenticated;


-- 4. PINDAH AHLI (upsert) -------------------------------------------------------
--
-- "Tambah ahli" kepada kumpulan B bagi ahli yang sudah dalam kumpulan A ialah
-- PINDAH, bukan ralat unik — upsert on conflict(member_id) mengelakkan admin
-- perlu buang dahulu secara manual. `security invoker`: RLS insert/update
-- pada kumpulan_usrah_members (can_edit_usrah()) tetap terpakai.

create or replace function public.kumpulan_usrah_set_member(p_kumpulan_id uuid, p_member_id uuid)
returns public.kumpulan_usrah_members
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.kumpulan_usrah_members;
begin
  insert into public.kumpulan_usrah_members (kumpulan_id, member_id)
  values (p_kumpulan_id, p_member_id)
  on conflict (member_id) do update set kumpulan_id = excluded.kumpulan_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.kumpulan_usrah_set_member(uuid, uuid) from public, anon;
grant execute on function public.kumpulan_usrah_set_member(uuid, uuid) to authenticated;


-- 5. CARTA ORGANISASI — naqib kumpulan usrah + naqib perkaderan sekolah --------
--
-- UNION, bukan menulis ke `org_positions` (lihat nota besar di atas fail).
-- display_order virtual (1,000,000+ / 2,000,000+) meletakkan kedua-dua
-- bahagian baharu selepas apa jua disusun SETIAUSAHA secara manual.

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
      kn.id,
      'Usrah Tarbiah'::text as bahagian,
      ('Naqib Kumpulan Usrah — ' || ku.nama)::text as jawatan,
      (1000000 + row_number() over (order by ku.kawasan_usrah, ku.nama, m.full_name))::integer as display_order,
      kn.member_id,
      m.full_name, m.generasi, m.avatar_url
    from public.kumpulan_usrah_naqib kn
    join public.kumpulan_usrah ku on ku.id = kn.kumpulan_id
    join public.members m on m.id = kn.member_id

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

notify pgrst, 'reload schema';
