-- =============================================================================
-- mysaf-off — Statistik Kelengkapan Data Ahli, versi 2 (6 kategori)
--
-- Jalankan SELEPAS 20260929000074_member_form_rombak.sql. Menggantikan
-- fungsi daripada 20260929000072_member_data_completeness.sql (migration
-- lama TIDAK diedit retroaktif — ikut sejarah repo) kerana borang ahli kini
-- 6 tab, bukan 5.
--
-- Enam kategori, setiap satu "Siap" hanya bila SEMUA medan relevan diisi
-- (medan bersyarat yang tidak relevan pada status semasa ahli itu TIDAK
-- dikira). Peratus keseluruhan = (kategori siap ÷ 6) × 100%, dibundarkan —
-- 0/17/33/50/67/83/100%.
--
-- Kategori (rujuk AGENTS.md untuk rekod keputusan penuh):
--   1. Data Peribadi — tidak berubah daripada v1
--   2. Pendidikan    — tidak berubah daripada v1
--   3. Pekerjaan     — status + butiran hanya bila 'bekerja'
--   4. Perniagaan    — BAHARU: siap jika tiada bisnes, atau semua bisnes lengkap
--   5. Keluarga      — status + pasangan/anak/sebab hanya bila berkahwin/pernah
--   6. Komitmen      — ganti nama "Jawatan": dua suis Ikhwan/PAS berasingan
--
-- Dikecualikan terus: full_name, generasi, email, nombor_ahli,
-- pembiayaan_lain, nama_anak.
-- =============================================================================


-- `create or replace` DITOLAK Postgres bila senarai OUT parameter berubah
-- (5 kategori boolean → 6, `jawatan` → `komitmen`) — mesti drop dahulu.
drop function if exists public.member_completeness_rows();

create function public.member_completeness_rows()
returns table (
  member_id   uuid,
  nombor_ahli text,
  full_name   text,
  generasi    text,
  data_peribadi boolean,
  pendidikan    boolean,
  pekerjaan     boolean,
  perniagaan    boolean,
  keluarga      boolean,
  komitmen      boolean,
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
      (m.status_pengajian in ('sedang_belajar', 'sudah_tamat'))    as studying,
      (m.status_pekerjaan = 'bekerja')                             as working,
      (m.status_perkahwinan in ('berkahwin', 'pernah_berkahwin'))  as married
    from public.members m
    where not m.disekat
  ),
  bisnes as (
    select
      mb.member_id,
      bool_and(
        mb.mode is not null
        and array_length(mb.sub_kategori, 1) > 0
        and nullif(trim(mb.nama_perniagaan), '') is not null
        and mb.negeri_operasi is not null
        and mb.anggaran_pendapatan_range is not null
      ) as semua_lengkap
    from public.member_businesses mb
    group by mb.member_id
  )
  select
    b.id as member_id,
    b.nombor_ahli,
    b.full_name,
    b.generasi,

    -- --- 1. Data Peribadi: tidak berubah daripada v1 -----------------------
    (
      nullif(trim(b.jantina), '') is not null
      and nullif(trim(b.nric), '') is not null
      and nullif(trim(b.no_tel), '') is not null
      and nullif(trim(b.alamat), '') is not null
      and nullif(trim(b.alamat_semasa), '') is not null
      and nullif(trim(b.kawasan_usrah), '') is not null
    ) as data_peribadi,

    -- --- 2. Pendidikan: tidak berubah daripada v1 ---------------------------
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

    -- --- 3. Pekerjaan: status wajib; butiran hanya bila 'bekerja' -----------
    (
      b.status_pekerjaan is not null
      and (
        not b.working
        or (
          nullif(trim(b.sektor_pekerjaan), '') is not null
          and nullif(trim(b.jawatan_pekerjaan), '') is not null
          and nullif(trim(b.nama_majikan), '') is not null
          and b.negeri_tempat_kerja is not null
          and b.anggaran_pendapatan_range is not null
        )
      )
    ) as pekerjaan,

    -- --- 4. Perniagaan (BAHARU): siap jika tiada bisnes, atau semua lengkap -
    (
      not exists (select 1 from bisnes x where x.member_id = b.id)
      or coalesce((select y.semua_lengkap from bisnes y where y.member_id = b.id), false)
    ) as perniagaan,

    -- --- 5. Keluarga: bujang automatik siap; berkahwin/pernah perlu pasangan+anak(+sebab) --
    (
      b.status_perkahwinan is not null
      and (
        b.status_perkahwinan = 'bujang'
        or (
          (b.spouse_member_id is not null or nullif(trim(b.nama_pasangan), '') is not null)
          and b.bil_anak is not null
          and (b.status_perkahwinan <> 'pernah_berkahwin' or b.sebab_bercerai_kematian is not null)
        )
      )
    ) as keluarga,

    -- --- 6. Komitmen (ganti "Jawatan"): dua suis berasingan -----------------
    (
      (not b.jawatan_ikhwan_aktif or (nullif(trim(b.jawatan_ikhwan_1), '') is not null and nullif(trim(b.jawatan_ikhwan_2), '') is not null))
      and (not b.jawatan_pas_aktif or (
        nullif(trim(b.jawatan_pas_1), '') is not null
        and nullif(trim(b.jawatan_pas_2), '') is not null
        and nullif(trim(b.no_keahlian_pas), '') is not null
      ))
    ) as komitmen,

    b.updated_at
  from base b;
$$;

revoke all on function public.member_completeness_rows() from public, anon, authenticated;


-- =============================================================================
-- RPC — agregat untuk skrin Statistik (6 kategori, bucket 0/17/33/50/67/83/100)
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
      (
        r.data_peribadi::int + r.pendidikan::int + r.pekerjaan::int
        + r.perniagaan::int + r.keluarga::int + r.komitmen::int
      ) as siap_count
    from public.member_completeness_rows() r
  )
  select jsonb_build_object(
    'jumlah_ahli', (select count(*) from rows),
    'kemaskini_terkini', (select max(updated_at) from public.members),
    'mengikut_kategori', jsonb_build_object(
      'data_peribadi', (select count(*) filter (where data_peribadi) from rows),
      'pendidikan',    (select count(*) filter (where pendidikan)    from rows),
      'pekerjaan',     (select count(*) filter (where pekerjaan)     from rows),
      'perniagaan',    (select count(*) filter (where perniagaan)    from rows),
      'keluarga',      (select count(*) filter (where keluarga)      from rows),
      'komitmen',      (select count(*) filter (where komitmen)      from rows)
    ),
    'mengikut_bucket', (
      select jsonb_agg(jsonb_build_object('peratus', k.peratus, 'jumlah', coalesce(c.jumlah, 0)) order by k.peratus desc)
      from (
        select g as siap_count, round(g * 100.0 / 6)::int as peratus
        from generate_series(0, 6) as g
      ) as k
      left join (
        select siap_count, count(*) as jumlah
        from rows
        group by 1
      ) c on c.siap_count = k.siap_count
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.member_data_completeness_summary() from public, anon;
grant execute on function public.member_data_completeness_summary() to authenticated;


-- =============================================================================
-- RPC — eksport per-ahli (untuk fail Excel), 6 kategori
-- =============================================================================

-- Sama sebab seperti `member_completeness_rows()` di atas — OUT parameter
-- berubah, `create or replace` akan ditolak Postgres.
drop function if exists public.member_data_completeness_export();

create function public.member_data_completeness_export()
returns table (
  nombor_ahli   text,
  full_name     text,
  generasi      text,
  data_peribadi boolean,
  pendidikan    boolean,
  pekerjaan     boolean,
  perniagaan    boolean,
  keluarga      boolean,
  komitmen      boolean,
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
    r.perniagaan,
    r.keluarga,
    r.komitmen,
    (
      r.data_peribadi::int + r.pendidikan::int + r.pekerjaan::int
      + r.perniagaan::int + r.keluarga::int + r.komitmen::int
    ),
    round((
      r.data_peribadi::int + r.pendidikan::int + r.pekerjaan::int
      + r.perniagaan::int + r.keluarga::int + r.komitmen::int
    ) * 100.0 / 6)::int,
    r.updated_at
  from public.member_completeness_rows() r
  order by r.nombor_ahli nulls last, r.full_name;
end;
$$;

revoke all on function public.member_data_completeness_export() from public, anon;
grant execute on function public.member_data_completeness_export() to authenticated;

notify pgrst, 'reload schema';
