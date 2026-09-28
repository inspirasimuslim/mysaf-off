-- =============================================================================
-- mysaf-off — Statistik Kelengkapan Data Ahli
--
-- Jalankan SELEPAS 20260929000071_statistik_dashboards.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Lima kategori, setiap satu "Siap" untuk seorang ahli hanya jika SEMUA medan
-- relevan diisi (medan bersyarat yang tidak relevan pada status semasa ahli
-- itu TIDAK dikira — cth. butiran institusi pengajian hanya wajib bila
-- `status_pengajian` sedang/sudah belajar). Peratus keseluruhan seorang ahli
-- = (bilangan kategori siap ÷ 5) × 100%, jadi sentiasa gandaan 20%.
--
-- Kategori (rujuk AGENTS.md untuk rekod keputusan penuh):
--   1. Data Peribadi — jantina, nric, no_tel, alamat, alamat_semasa, kawasan_usrah
--   2. Pendidikan   — asas + institusi bila sedang/sudah belajar
--   3. Pekerjaan    — status + butiran bekerja/berniaga bila relevan
--   4. Keluarga     — asas isi rumah/ibu bapa + butiran pasangan bila berkahwin
--   5. Jawatan      — sekurang-kurangnya satu jawatan, ATAU disahkan tiada
--
-- Dikecualikan terus (sentiasa penuh atau elaborasi bebas): full_name,
-- generasi, email, nombor_ahli, pembiayaan_lain, nama_anak.
-- =============================================================================


-- =============================================================================
-- 1. COLUMN jawatan_disahkan_tiada
--
-- Beza "belum sempat isi" (false, lalai) daripada "memang tiada jawatan"
-- (true, ditetapkan sendiri oleh ahli/admin melalui satu toggle eksplisit
-- dalam tab Jawatan). TIDAK ditanda retroaktif untuk ahli sedia ada — mereka
-- kekal `false` sehingga disahkan, supaya kategori Jawatan tidak silap
-- menandakan ahli lama sebagai "sudah disahkan tiada" sedangkan ia cuma
-- belum pernah disentuh.
-- =============================================================================

alter table public.members
  add column if not exists jawatan_disahkan_tiada boolean not null default false;


-- =============================================================================
-- 2. FUNGSI DALAMAN — satu baris kelengkapan setiap ahli
--
-- TIDAK di-grant kepada `authenticated` — hanya boleh dipanggil dari dalam
-- fungsi `security definer` lain yang sudah menyemak kebenaran (pemanggilan
-- dalaman mewarisi peranan definer, bukan peranan pemanggil asal). Ini
-- mengelak dua fungsi awam perlu menyalin logik lima kategori yang sama.
-- =============================================================================

create or replace function public.member_completeness_rows()
returns table (
  member_id   uuid,
  nombor_ahli text,
  full_name   text,
  generasi    text,
  data_peribadi boolean,
  pendidikan    boolean,
  pekerjaan     boolean,
  keluarga      boolean,
  jawatan       boolean,
  updated_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      m.*,
      (m.status_pengajian in ('sedang_belajar', 'sudah_tamat'))            as studying,
      (m.status_pekerjaan in ('bekerja', 'bekerja_dan_belajar', 'pesara')) as working,
      (m.status_pekerjaan = 'berniaga_usahawan')                          as in_business,
      (m.status_perkahwinan in ('berkahwin_mbm', 'berkahwin_bukan_mbm'))  as married,
      (m.status_perkahwinan = 'berkahwin_mbm')                            as married_mbm
    from public.members m
    where not m.disekat
  )
  select
    b.id as member_id,
    b.nombor_ahli,
    b.full_name,
    b.generasi,

    -- --- 1. Data Peribadi: enam medan isi-sendiri, wajib untuk semua ahli --
    (
      nullif(trim(b.jantina), '') is not null
      and nullif(trim(b.nric), '') is not null
      and nullif(trim(b.no_tel), '') is not null
      and nullif(trim(b.alamat), '') is not null
      and nullif(trim(b.alamat_semasa), '') is not null
      and nullif(trim(b.kawasan_usrah), '') is not null
    ) as data_peribadi,

    -- --- 2. Pendidikan: asas + institusi hanya bila sedang/sudah belajar --
    (
      nullif(trim(b.tahap_pendidikan), '') is not null
      and b.status_pengajian is not null
      and nullif(trim(b.sekolah), '') is not null
      and (
        not b.studying
        or (
          nullif(trim(b.nama_institusi), '') is not null
          and nullif(trim(b.alamat_institusi), '') is not null
          and nullif(trim(b.tahun_pengajian), '') is not null
          and nullif(trim(b.jurusan_pengajian), '') is not null
          and nullif(trim(b.sumber_pembiayaan), '') is not null
        )
      )
    ) as pendidikan,

    -- --- 3. Pekerjaan: asas + butiran bekerja/berniaga sahaja bila relevan -
    (
      b.status_pekerjaan is not null
      and (
        (not b.working and not b.in_business)
        or (
          nullif(trim(b.nama_majikan), '') is not null
          and nullif(trim(b.alamat_tempat_kerja), '') is not null
          and b.anggaran_pendapatan_range is not null
          and (
            not b.working
            or (nullif(trim(b.sektor_pekerjaan), '') is not null and nullif(trim(b.jawatan_pekerjaan), '') is not null)
          )
          and (not b.in_business or nullif(trim(b.jenis_perniagaan), '') is not null)
        )
      )
    ) as pekerjaan,

    -- --- 4. Keluarga: asas isi rumah/ibu bapa (semua ahli) + pasangan bila --
    -- --- berkahwin --------------------------------------------------------
    (
      b.status_perkahwinan is not null
      and b.anggaran_pendapatan_isi_rumah_range is not null
      and b.bil_tanggungan_selain_keluarga is not null
      and nullif(trim(b.pekerjaan_ibu), '') is not null
      and nullif(trim(b.pekerjaan_bapa), '') is not null
      and b.bil_tanggungan_ibu_bapa is not null
      and (
        not b.married
        or (
          nullif(trim(b.tahun_berkahwin), '') is not null
          and b.bil_anak is not null
          and (
            (b.married_mbm and b.spouse_member_id is not null)
            or (not b.married_mbm and nullif(trim(b.nama_pasangan), '') is not null)
          )
        )
      )
    ) as keluarga,

    -- --- 5. Jawatan: sekurang-kurangnya satu, ATAU disahkan tiada ---------
    (
      nullif(trim(b.jawatan_ikhwan_1), '') is not null
      or nullif(trim(b.jawatan_ikhwan_2), '') is not null
      or nullif(trim(b.jawatan_ikhwan_3), '') is not null
      or nullif(trim(b.jawatan_pas_1), '') is not null
      or nullif(trim(b.jawatan_pas_2), '') is not null
      or nullif(trim(b.jawatan_pas_3), '') is not null
      or nullif(trim(b.no_keahlian_pas), '') is not null
      or b.jawatan_disahkan_tiada
    ) as jawatan,

    b.updated_at
  from base b;
$$;

revoke all on function public.member_completeness_rows() from public, anon, authenticated;


-- =============================================================================
-- 3. RPC — agregat untuk skrin Statistik
-- =============================================================================

create or replace function public.member_data_completeness_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Statistik kelengkapan data memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  with rows as (
    select
      r.*,
      (r.data_peribadi::int + r.pendidikan::int + r.pekerjaan::int + r.keluarga::int + r.jawatan::int) as siap_count
    from public.member_completeness_rows() r
  )
  select jsonb_build_object(
    'jumlah_ahli', (select count(*) from rows),
    'kemaskini_terkini', (select max(updated_at) from public.members),
    'mengikut_kategori', jsonb_build_object(
      'data_peribadi', (select count(*) filter (where data_peribadi) from rows),
      'pendidikan',    (select count(*) filter (where pendidikan)    from rows),
      'pekerjaan',     (select count(*) filter (where pekerjaan)     from rows),
      'keluarga',      (select count(*) filter (where keluarga)      from rows),
      'jawatan',       (select count(*) filter (where jawatan)       from rows)
    ),
    'mengikut_bucket', (
      select jsonb_agg(jsonb_build_object('peratus', k.peratus, 'jumlah', coalesce(c.jumlah, 0)) order by k.peratus desc)
      from (values (100), (80), (60), (40), (20), (0)) as k(peratus)
      left join (
        select siap_count * 20 as peratus, count(*) as jumlah
        from rows
        group by 1
      ) c on c.peratus = k.peratus
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.member_data_completeness_summary() from public, anon;
grant execute on function public.member_data_completeness_summary() to authenticated;


-- =============================================================================
-- 4. RPC — eksport per-ahli (untuk fail Excel)
--
-- Fungsi berasingan daripada `members_full_export()`: laporan ini bukan salinan
-- data ahli untuk disunting semula, tetapi status kelengkapan lima kategori —
-- bentuk lajur yang berbeza sepenuhnya.
-- =============================================================================

create or replace function public.member_data_completeness_export()
returns table (
  nombor_ahli   text,
  full_name     text,
  generasi      text,
  data_peribadi boolean,
  pendidikan    boolean,
  pekerjaan     boolean,
  keluarga      boolean,
  jawatan       boolean,
  jumlah_siap   int,
  peratus       int,
  updated_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Eksport kelengkapan data memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  return query
  select
    r.nombor_ahli,
    r.full_name,
    r.generasi,
    r.data_peribadi,
    r.pendidikan,
    r.pekerjaan,
    r.keluarga,
    r.jawatan,
    (r.data_peribadi::int + r.pendidikan::int + r.pekerjaan::int + r.keluarga::int + r.jawatan::int),
    (r.data_peribadi::int + r.pendidikan::int + r.pekerjaan::int + r.keluarga::int + r.jawatan::int) * 20,
    r.updated_at
  from public.member_completeness_rows() r
  order by r.nombor_ahli nulls last, r.full_name;
end;
$$;

revoke all on function public.member_data_completeness_export() from public, anon;
grant execute on function public.member_data_completeness_export() to authenticated;

notify pgrst, 'reload schema';
