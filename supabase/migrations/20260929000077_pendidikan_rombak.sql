-- =============================================================================
-- mysaf-off — Rombak tab Pendidikan (borang ahli)
--
-- Jalankan SELEPAS 20260929000076_pendidikan_rombak_backup.sql.
--
-- Dua perubahan struktur besar:
--   1. `sekolah` (teks bebas) → `sekolah_id` (FK kepada table `schools`
--      baharu, diurus admin — Super Admin, sama corak `generations`).
--   2. Lapan medan pendidikan flat pada `members` (`tahap_pendidikan`,
--      `status_pengajian`, `nama_institusi`, `alamat_institusi`,
--      `tahun_pengajian`, `jurusan_pengajian`, `sumber_pembiayaan`,
--      `pembiayaan_lain`) dibuang — dipindah kepada table `member_education`
--      (satu-ke-banyak, sama corak `member_businesses`) supaya seorang ahli
--      boleh merekod BEBERAPA peringkat pendidikan selepas SPM.
--
-- Data lama `sekolah` (teks bebas) TIDAK cuba dipadan automatik kepada
-- `schools` baharu — ia di-NULL-kan terus, ahli/admin pilih semula dari
-- dropdown. Lapan medan flat lama juga tidak dipindah ke `member_education`
-- (mod baharu tidak wujud dalam data lama) — biar diisi semula dari kosong,
-- sama falsafah dengan rombak 6-tab sebelum ini.
-- =============================================================================


-- =============================================================================
-- 1. TABLE schools — senarai sekolah, diurus Super Admin
--
-- RLS sama corak PERSIS `generations` (`20260906000002_members.sql`): baca
-- terbuka kepada semua ahli (untuk dropdown), tulis Super Admin sahaja.
-- =============================================================================

create table if not exists public.schools (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null unique,
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists schools_set_updated_at on public.schools;
create trigger schools_set_updated_at
  before update on public.schools
  for each row execute function public.set_updated_at();

alter table public.schools enable row level security;

drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools
  for select to authenticated
  using (true);

drop policy if exists schools_insert on public.schools;
create policy schools_insert on public.schools
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists schools_update on public.schools;
create policy schools_update on public.schools
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists schools_delete on public.schools;
create policy schools_delete on public.schools
  for delete to authenticated
  using (public.is_super_admin());

grant select, insert, update, delete on public.schools to authenticated;


-- =============================================================================
-- 2. TABLE member_education (BAHARU) — tab Pendidikan, peringkat selepas SPM
--
-- Satu ahli boleh ada BANYAK peringkat (0..N) — sama corak `member_businesses`
-- (`20260929000074_member_form_rombak.sql`): RLS pemilik sendiri
-- (`my_member_id()`) ATAU `can_view_members()`/`can_edit_members()` sedia ada.
-- =============================================================================

create table if not exists public.member_education (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references public.members (id) on delete cascade,
  peringkat          text not null check (
    peringkat in (
      'stpm', 'diploma', 'matrikulasi', 'asasi', 'sijil_tvet',
      'program_perguruan', 'sarjana_muda', 'sarjana', 'phd', 'lain_lain'
    )
  ),
  jurusan            text,
  institusi          text,
  status_pengajian   text not null check (status_pengajian in ('tamat', 'sedang_menjalani')),
  -- Hanya relevan bila status_pengajian = 'sedang_menjalani' — tidak
  -- dikuatkuasakan sebagai CHECK silang kolum (RLS/DB tidak boleh
  -- membandingkan dua kolum lain dengan mudah dalam satu CHECK yang kekal
  -- mudah dibaca); borang yang menguatkuasakan medan mana dipapar.
  sumber_pembiayaan  text check (
    sumber_pembiayaan is null or sumber_pembiayaan in ('ptptn', 'jpa', 'biasiswa_lain', 'sendiri', 'lain_lain')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_education_member_id_idx on public.member_education (member_id);

drop trigger if exists member_education_set_updated_at on public.member_education;
create trigger member_education_set_updated_at
  before update on public.member_education
  for each row execute function public.set_updated_at();

alter table public.member_education enable row level security;

drop policy if exists member_education_select on public.member_education;
create policy member_education_select on public.member_education
  for select to authenticated
  using (public.can_view_members() or member_id = public.my_member_id());

drop policy if exists member_education_insert on public.member_education;
create policy member_education_insert on public.member_education
  for insert to authenticated
  with check (public.can_edit_members() or member_id = public.my_member_id());

drop policy if exists member_education_update on public.member_education;
create policy member_education_update on public.member_education
  for update to authenticated
  using (public.can_edit_members() or member_id = public.my_member_id())
  with check (public.can_edit_members() or member_id = public.my_member_id());

drop policy if exists member_education_delete on public.member_education;
create policy member_education_delete on public.member_education
  for delete to authenticated
  using (public.can_edit_members() or member_id = public.my_member_id());

grant select, insert, update, delete on public.member_education to authenticated;


-- =============================================================================
-- 3. members — sekolah (teks) → sekolah_id (FK), buang 8 medan pendidikan flat
-- =============================================================================

-- `on delete restrict` (BUKAN `set null`) — sama corak `members.generasi`
-- (`references public.generations (code) on update cascade on delete
-- restrict` dalam `20260906000002_members.sql`). Padam sekolah yang masih
-- dirujuk mana-mana ahli DITOLAK oleh DB, bukan senyap mengosongkan
-- `sekolah_id` semua ahli berkaitan — admin dipaksa nyahaktifkan
-- (`aktif = false`) dahulu, sama seperti Generasi.
alter table public.members
  add column if not exists sekolah_id uuid references public.schools (id) on delete restrict;

create index if not exists members_sekolah_id_idx on public.members (sekolah_id);

-- Data lama tidak dipadan automatik — kosongkan terus (lihat nota atas fail).
update public.members set sekolah = null where sekolah is not null;

alter table public.members
  drop column if exists sekolah,
  drop column if exists tahap_pendidikan,
  drop column if exists status_pengajian,
  drop column if exists nama_institusi,
  drop column if exists alamat_institusi,
  drop column if exists tahun_pengajian,
  drop column if exists jurusan_pengajian,
  drop column if exists sumber_pembiayaan,
  drop column if exists pembiayaan_lain;


-- =============================================================================
-- 4. members_full_export() — kemas kini bentuk lajur ikut skema baharu
--
-- `sekolah` KEKAL sebagai nama lajur output (teks, nama sekolah) — diselesai
-- melalui JOIN kepada `schools`, bukan lagi kolum terus. Lapan medan
-- pendidikan flat dibuang. `member_education` (1-ke-banyak) TIDAK disertakan
-- — sama keputusan seperti `member_businesses` dalam eksport ini.
-- =============================================================================

drop function if exists public.members_full_export();

create function public.members_full_export()
returns table (
  nombor_ahli             text,
  generasi                text,
  full_name               text,
  jantina                 text,
  nric                    text,
  email                   text,
  no_tel                  text,
  alamat                  text,
  alamat_semasa           text,
  kawasan_usrah           text,
  disekat                 boolean,
  jawatan_ikhwan_1        text,
  jawatan_ikhwan_2        text,
  jawatan_ikhwan_aktif    boolean,
  jawatan_pas_1           text,
  jawatan_pas_2           text,
  no_keahlian_pas         text,
  jawatan_pas_aktif       boolean,
  sekolah                 text,
  status_pekerjaan        text,
  sektor_pekerjaan        text,
  jawatan_pekerjaan       text,
  nama_majikan            text,
  negeri_tempat_kerja     text,
  anggaran_pendapatan_range text,
  status_perkahwinan      text,
  nama_pasangan           text,
  tahun_berkahwin         text,
  bil_anak                integer,
  sebab_bercerai_kematian text,
  self_updated_at         timestamptz,
  created_at              timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Eksport data ahli memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  return query
  select
    m.nombor_ahli,
    m.generasi,
    m.full_name,
    m.jantina,
    m.nric,
    m.email,
    m.no_tel,
    m.alamat,
    m.alamat_semasa,
    m.kawasan_usrah,
    m.disekat,
    m.jawatan_ikhwan_1,
    m.jawatan_ikhwan_2,
    m.jawatan_ikhwan_aktif,
    m.jawatan_pas_1,
    m.jawatan_pas_2,
    m.no_keahlian_pas,
    m.jawatan_pas_aktif,
    s.nama as sekolah,
    m.status_pekerjaan,
    m.sektor_pekerjaan,
    m.jawatan_pekerjaan,
    m.nama_majikan,
    m.negeri_tempat_kerja,
    m.anggaran_pendapatan_range,
    m.status_perkahwinan,
    m.nama_pasangan,
    m.tahun_berkahwin,
    m.bil_anak,
    m.sebab_bercerai_kematian,
    m.self_updated_at,
    m.created_at
  from public.members m
  left join public.schools s on s.id = m.sekolah_id
  order by m.nombor_ahli nulls last, m.full_name;
end;
$$;

revoke all on function public.members_full_export() from public, anon;
grant execute on function public.members_full_export() to authenticated;


-- =============================================================================
-- 5. member_statistics() — kategori "Sekolah" tulis semula ikut schools/sekolah_id
--
-- Senarai TETAP lama (VALUES 7 nama sekolah + alias) diganti JOIN dinamik
-- kepada `schools` — senarai sekolah kini boleh berkembang melalui skrin
-- admin, jadi kategori statistik tidak boleh lagi hardcode nama.
-- =============================================================================

create or replace function public.member_statistics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.can_read_shared(), false) then
    raise exception 'Rumusan ahli hanya untuk akaun ahli yang aktif.' using errcode = 'MS001';
  end if;

  with m as (
    select
      lower(nullif(trim(jantina), '')) as jantina,
      generasi,
      sekolah_id,
      upper(nullif(trim(kawasan_usrah), '')) as kawasan,
      status_pekerjaan,
      status_perkahwinan,
      upper(coalesce(nullif(trim(alamat_semasa), ''), nullif(trim(alamat), ''))) as alamat
    from public.members
  )
  select jsonb_build_object(
    'total_ahli', (select count(*) from m),

    'ikut_jantina', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (values (1, 'Muslimin'), (2, 'Muslimat'), (3, 'Tiada Rekod')) as k(ord, label)
      left join (
        select
          case
            when jantina in ('muslimin', 'lelaki') then 'Muslimin'
            when jantina in ('muslimat', 'perempuan') then 'Muslimat'
            else 'Tiada Rekod'
          end as label,
          count(*) as jumlah
        from m
        group by 1
      ) c on c.label = k.label
    ),

    'ikut_generasi', (
      select jsonb_agg(jsonb_build_object('label', s.label, 'count', s.jumlah) order by s.ord, s.label)
      from (
        select
          g.code as label,
          coalesce(nullif(regexp_replace(g.code, '\D', '', 'g'), '')::int, 9999) as ord,
          count(m.generasi) as jumlah
        from public.generations g
        left join m on m.generasi = g.code
        group by g.code
        union all
        select 'Tiada Rekod', 100000, count(*)
        from m
        where m.generasi is null or m.generasi not in (select code from public.generations)
        having count(*) > 0
      ) s
    ),

    -- --- Sekolah: JOIN dinamik kepada `schools` (senarai boleh berkembang) --
    'ikut_sekolah', (
      with kiraan as (
        select sekolah_id, count(*) as jumlah
        from m
        group by sekolah_id
      )
      select jsonb_agg(
        jsonb_build_object('label', coalesce(sc.nama, 'Tiada Rekod'), 'count', k.jumlah)
        order by (sc.nama is null), k.jumlah desc, sc.nama
      )
      from kiraan k
      left join public.schools sc on sc.id = k.sekolah_id
    ),

    'ikut_kawasan_usrah', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (
        values (1, 'US'), (2, 'ULK'), (3, 'UU'), (4, 'UPT'), (5, 'UT'), (6, 'UTS'), (7, 'UB'), (8, 'UA'), (9, 'Tiada Rekod')
      ) as k(ord, label)
      left join (
        select
          case
            when kawasan in ('US', 'ULK', 'UU', 'UPT', 'UT', 'UTS', 'UB', 'UA') then kawasan
            else 'Tiada Rekod'
          end as label,
          count(*) as jumlah
        from m
        group by 1
      ) c on c.label = k.label
    ),

    'ikut_status_pekerjaan', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (
        values
          (1, 'bekerja', 'Bekerja'),
          (2, 'suri_rumah', 'Suri Rumah'),
          (3, 'tidak_bekerja', 'Tidak Bekerja'),
          (4, 'pesara', 'Pesara'),
          (5, null, 'Tiada Rekod')
      ) as k(ord, kod, label)
      left join (
        select coalesce(status_pekerjaan, '') as kod, count(*) as jumlah
        from m
        group by 1
      ) c on c.kod = coalesce(k.kod, '')
    ),

    'ikut_status_perkahwinan', (
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (
        values
          (1, 'bujang', 'Bujang'),
          (2, 'berkahwin', 'Berkahwin'),
          (3, 'pernah_berkahwin', 'Pernah Berkahwin'),
          (4, null, 'Tiada Rekod')
      ) as k(ord, kod, label)
      left join (
        select coalesce(status_perkahwinan, '') as kod, count(*) as jumlah
        from m
        group by 1
      ) c on c.kod = coalesce(k.kod, '')
    ),

    -- --- Negeri: ANGGARAN BEST-EFFORT daripada teks alamat — tidak berubah -
    'ikut_negeri', (
      with corak(negeri, teks) as (
        values
          ('Selangor', 'SELANGOR'),
          ('Kuala Lumpur', 'KUALA LUMPUR'),
          ('Johor', 'JOHOR'),
          ('Perak', 'PERAK'),
          ('Kedah', 'KEDAH'),
          ('Pulau Pinang', 'PULAU PINANG'),
          ('Pulau Pinang', 'PENANG'),
          ('Pulau Pinang', 'P. PINANG'),
          ('Pulau Pinang', 'P.PINANG'),
          ('Pahang', 'PAHANG'),
          ('Terengganu', 'TERENGGANU'),
          ('Terengganu', 'TRENGGANU'),
          ('Kelantan', 'KELANTAN'),
          ('Negeri Sembilan', 'NEGERI SEMBILAN'),
          ('Negeri Sembilan', 'N. SEMBILAN'),
          ('Negeri Sembilan', 'N.SEMBILAN'),
          ('Melaka', 'MELAKA'),
          ('Melaka', 'MALACCA'),
          ('Perlis', 'PERLIS'),
          ('Sabah', 'SABAH'),
          ('Sarawak', 'SARAWAK'),
          ('Putrajaya', 'PUTRAJAYA'),
          ('Labuan', 'LABUAN')
      ),
      dikesan as (
        select coalesce(
          (
            select c.negeri
            from corak c
            where strpos(m.alamat, c.teks) > 0
            order by strpos(reverse(m.alamat), reverse(c.teks)), length(c.teks) desc
            limit 1
          ),
          'Tidak Dapat Dikenal Pasti'
        ) as negeri
        from m
      )
      select jsonb_agg(
        jsonb_build_object('label', negeri, 'count', jumlah)
        order by (negeri = 'Tidak Dapat Dikenal Pasti'), jumlah desc, negeri
      )
      from (select negeri, count(*) as jumlah from dikesan group by negeri) s
    ),

    'dijana_pada', now()
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.member_statistics() from public, anon;
grant execute on function public.member_statistics() to authenticated;

notify pgrst, 'reload schema';
