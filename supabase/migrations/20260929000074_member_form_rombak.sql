-- =============================================================================
-- mysaf-off — Rombak borang ahli: 6 tab baharu (Peribadi/Pendidikan/
-- Pekerjaan/Perniagaan/Keluarga/Komitmen)
--
-- Jalankan SELEPAS 20260929000073_member_rombak_backup.sql (snapshot rollback
-- WAJIB wujud sebelum migration ini — ia memadam kolum dan meng-NULL-kan
-- data). Skrip ini idempotent secara struktur, TAPI langkah UPDATE reset data
-- (seksyen 1) hanya bermakna sekali — menjalankannya semula tidak merosakkan
-- apa-apa (ia cuma NULL/false lagi nilai yang admin/ahli sudah isi semula),
-- jadi JANGAN jalankan migration ini lebih daripada sekali selepas ahli mula
-- mengisi borang baharu.
--
-- Rujuk AGENTS.md untuk rekod keputusan penuh struktur 6 tab.
-- =============================================================================


-- =============================================================================
-- 1. RESET DATA — sebelum sebarang ALTER/CONSTRAINT, supaya constraint
--    baharu tidak gagal atas nilai lama yang tidak lagi sah.
-- =============================================================================

-- --- Keluarga: arahan literal — kosongkan status perkahwinan + pasangan
-- untuk SEMUA ahli, isi semula dari kosong ikut model 3-peringkat baharu.
--
-- Trigger `members_sync_spouse_link` DIMATIKAN sementara untuk SATU UPDATE
-- ini sahaja: ia menulis balik `spouse_member_id` pasangan setiap baris yang
-- berubah, dan UPDATE pukal ini menyentuh KEDUA-DUA belah setiap pasangan MBM
-- dalam SATU statement — coretan silang trigger + statement pukal pada baris
-- yang sama menghasilkan ralat Postgres "tuple already modified by an
-- operation triggered by the current command" (SQLSTATE 27000). Selamat
-- dimatikan di sini kerana UPDATE ini sendiri sudah meng-NULL kedua-dua belah
-- setiap pasangan serentak — tiada keadaan separuh boleh terhasil sama ada
-- trigger aktif atau tidak.
alter table public.members disable trigger members_sync_spouse_link;

update public.members
set status_perkahwinan = null,
    spouse_member_id   = null,
    nama_pasangan       = null
where status_perkahwinan is not null
   or spouse_member_id is not null
   or nama_pasangan is not null;

alter table public.members enable trigger members_sync_spouse_link;

-- --- Pekerjaan: 3 nilai status_pekerjaan lama tidak lagi wujud (Perniagaan
-- kini tab berasingan; "belajar" bukan lagi status pekerjaan — status_pengajian
-- sudah menjejakinya secara bebas). Kosongkan, biar ahli/admin pilih semula
-- daripada 4 nilai baharu.
update public.members
set status_pekerjaan = null
where status_pekerjaan in ('berniaga_usahawan', 'belajar_sepenuh_masa', 'bekerja_dan_belajar');

-- --- sektor_pekerjaan bertukar daripada teks bebas kepada chip 3-pilihan;
-- teks lama tidak boleh dipetakan dengan selamat kepada kod baharu.
update public.members
set sektor_pekerjaan = null
where sektor_pekerjaan is not null;


-- =============================================================================
-- 2. TAMBAH KOLUM BAHARU
-- =============================================================================

alter table public.members
  add column if not exists negeri_tempat_kerja text,
  add column if not exists jawatan_ikhwan_aktif boolean not null default false,
  add column if not exists jawatan_pas_aktif    boolean not null default false,
  add column if not exists sebab_bercerai_kematian text;

alter table public.members drop constraint if exists members_negeri_tempat_kerja_check;
alter table public.members add constraint members_negeri_tempat_kerja_check check (
  negeri_tempat_kerja is null or negeri_tempat_kerja in (
    'Selangor', 'Kuala Lumpur', 'Johor', 'Perak', 'Kedah', 'Pulau Pinang', 'Pahang',
    'Terengganu', 'Kelantan', 'Negeri Sembilan', 'Melaka', 'Perlis', 'Sabah', 'Sarawak',
    'Putrajaya', 'Labuan'
  )
);

alter table public.members drop constraint if exists members_sebab_bercerai_kematian_check;
alter table public.members add constraint members_sebab_bercerai_kematian_check check (
  sebab_bercerai_kematian is null or sebab_bercerai_kematian in ('bercerai', 'kematian_pasangan')
);


-- =============================================================================
-- 3. BACKFILL suis Komitmen — jangan sembunyikan data yang sudah diisi
--
-- Ahli yang SUDAH ADA jawatan_ikhwan_1/2 atau jawatan_pas_1/2/no_keahlian_pas
-- ditanda `true` supaya tab Komitmen baharu terus memaparkan data itu,
-- bukan menyembunyikannya di sebalik suis yang nampak "OFF".
-- =============================================================================

update public.members
set jawatan_ikhwan_aktif = true
where not jawatan_ikhwan_aktif
  and (nullif(trim(jawatan_ikhwan_1), '') is not null or nullif(trim(jawatan_ikhwan_2), '') is not null);

update public.members
set jawatan_pas_aktif = true
where not jawatan_pas_aktif
  and (
    nullif(trim(jawatan_pas_1), '') is not null
    or nullif(trim(jawatan_pas_2), '') is not null
    or nullif(trim(no_keahlian_pas), '') is not null
  );


-- =============================================================================
-- 4. BUANG KOLUM LAMA
-- =============================================================================

alter table public.members
  drop column if exists alamat_tempat_kerja,
  drop column if exists jenis_perniagaan,
  drop column if exists jawatan_ikhwan_3,
  drop column if exists jawatan_pas_3,
  drop column if exists jawatan_disahkan_tiada,
  drop column if exists pekerjaan_ibu,
  drop column if exists pekerjaan_bapa,
  drop column if exists bil_tanggungan_ibu_bapa,
  drop column if exists bil_tanggungan_selain_keluarga,
  drop column if exists anggaran_pendapatan_isi_rumah_range;


-- =============================================================================
-- 5. CONSTRAINT BAHARU — enum yang dikecilkan/ditukar
-- =============================================================================

alter table public.members drop constraint if exists members_status_pekerjaan_check;
alter table public.members add constraint members_status_pekerjaan_check check (
  status_pekerjaan is null or status_pekerjaan in ('bekerja', 'suri_rumah', 'tidak_bekerja', 'pesara')
);

alter table public.members drop constraint if exists members_status_perkahwinan_check;
alter table public.members add constraint members_status_perkahwinan_check check (
  status_perkahwinan is null or status_perkahwinan in ('bujang', 'berkahwin', 'pernah_berkahwin')
);

alter table public.members drop constraint if exists members_sektor_pekerjaan_check;
alter table public.members add constraint members_sektor_pekerjaan_check check (
  sektor_pekerjaan is null or sektor_pekerjaan in ('kerajaan', 'swasta', 'separuh_kerajaan_glc')
);


-- =============================================================================
-- 6. TABLE member_businesses (BAHARU) — tab Perniagaan
--
-- Satu ahli boleh ada BANYAK perniagaan (0..N), jadi table berasingan dan
-- bukan kolum flat pada `members`. RLS mengikut corak `yuran_ledger`/
-- `pipis_contributions` sedia ada: pemilik sendiri guna `my_member_id()`,
-- admin JABATAN DATA & SUMBER MANUSIA guna `can_view_members()`/
-- `can_edit_members()` sedia ada — tiada fungsi kebenaran baharu dicipta.
-- =============================================================================

create table if not exists public.member_businesses (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members (id) on delete cascade,
  mode            text not null check (mode in ('online', 'offline', 'kedua_dua')),
  sub_kategori    text[] not null default '{}' check (
    sub_kategori <@ array[
      'e_dagang', 'reseller_dropship', 'perkhidmatan_digital', 'affiliate_marketing',
      'runcit_kedai', 'makanan_minuman', 'perkhidmatan', 'pertanian_ternakan',
      'automotif', 'lain_lain'
    ]::text[]
  ),
  nama_perniagaan text,
  negeri_operasi  text check (
    negeri_operasi is null or negeri_operasi in (
      'Selangor', 'Kuala Lumpur', 'Johor', 'Perak', 'Kedah', 'Pulau Pinang', 'Pahang',
      'Terengganu', 'Kelantan', 'Negeri Sembilan', 'Melaka', 'Perlis', 'Sabah', 'Sarawak',
      'Putrajaya', 'Labuan'
    )
  ),
  anggaran_pendapatan_range text check (
    anggaran_pendapatan_range is null or anggaran_pendapatan_range in ('<1000', '1000-2999', '3000-4999', '5000-9999', '10000+')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_businesses_member_id_idx on public.member_businesses (member_id);

drop trigger if exists member_businesses_set_updated_at on public.member_businesses;
create trigger member_businesses_set_updated_at
  before update on public.member_businesses
  for each row execute function public.set_updated_at();

alter table public.member_businesses enable row level security;

drop policy if exists member_businesses_select on public.member_businesses;
create policy member_businesses_select on public.member_businesses
  for select to authenticated
  using (public.can_view_members() or member_id = public.my_member_id());

drop policy if exists member_businesses_insert on public.member_businesses;
create policy member_businesses_insert on public.member_businesses
  for insert to authenticated
  with check (public.can_edit_members() or member_id = public.my_member_id());

drop policy if exists member_businesses_update on public.member_businesses;
create policy member_businesses_update on public.member_businesses
  for update to authenticated
  using (public.can_edit_members() or member_id = public.my_member_id())
  with check (public.can_edit_members() or member_id = public.my_member_id());

drop policy if exists member_businesses_delete on public.member_businesses;
create policy member_businesses_delete on public.member_businesses
  for delete to authenticated
  using (public.can_edit_members() or member_id = public.my_member_id());

grant select, insert, update, delete on public.member_businesses to authenticated;


-- =============================================================================
-- 7. members_full_export() — kemas kini bentuk lajur ikut skema baharu
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
  tahap_pendidikan        text,
  status_pengajian        text,
  sekolah                 text,
  nama_institusi          text,
  alamat_institusi        text,
  tahun_pengajian         text,
  jurusan_pengajian       text,
  sumber_pembiayaan       text,
  pembiayaan_lain         text,
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
    m.tahap_pendidikan,
    m.status_pengajian,
    m.sekolah,
    m.nama_institusi,
    m.alamat_institusi,
    m.tahun_pengajian,
    m.jurusan_pengajian,
    m.sumber_pembiayaan,
    m.pembiayaan_lain,
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
  order by m.nombor_ahli nulls last, m.full_name;
end;
$$;

revoke all on function public.members_full_export() from public, anon;
grant execute on function public.members_full_export() to authenticated;


-- =============================================================================
-- 8. member_statistics() — buang kategori mati, kemas kini status_perkahwinan
--
-- Fix minimum supaya Rumusan Ahli tidak papar kategori yang sudah mustahil
-- (retired) — BUKAN redesign. Tiada slice "Ada Perniagaan" baharu di sini.
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
      upper(regexp_replace(trim(coalesce(sekolah, '')), '\s+', ' ', 'g')) as sekolah,
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

    'ikut_sekolah', (
      with senarai(ord, label, alias) as (
        values
          (1, 'SMKA FALAHIAH', array['SMKA FALAHIAH']),
          (2, 'SMKA NAIM LILBANAT', array['SMKA NAIM LILBANAT']),
          (3, 'SMKA TOK BACHOK', array['SMKA TOK BACHOK']),
          (4, 'MAAHAD MUHAMMADI PASIR MAS', array['MAAHAD MUHAMMADI PASIR MAS']),
          (5, 'MAAHAD AMIR INDERA PETRA', array['MAAHAD AMIR INDERA PETRA']),
          (6, 'SMA TG AMALIN AISYAH', array['SMA TG AMALIN AISYAH']),
          (7, 'SMK KOTA DAMANSARA', array['SMK KOTA DAMANSARA', 'SMK DAMANSARA'])
      ),
      kiraan as (
        select coalesce(s.label, 'Lain-lain / Tiada Rekod') as label, count(*) as jumlah
        from m
        left join senarai s on m.sekolah = any (s.alias)
        group by 1
      )
      select jsonb_agg(jsonb_build_object('label', k.label, 'count', coalesce(c.jumlah, 0)) order by k.ord)
      from (select ord, label from senarai union all select 8, 'Lain-lain / Tiada Rekod') k
      left join kiraan c on c.label = k.label
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

    -- --- Status pekerjaan: 4 nilai baharu sahaja (Perniagaan/belajar buang) -
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

    -- --- Status perkahwinan: model 3-peringkat baharu ----------------------
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
