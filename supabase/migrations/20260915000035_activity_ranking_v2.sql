-- =============================================================================
-- MySAFF — Penarafan Ahli dan Generasi (v2)
--
-- Jalankan SELEPAS 20260915000034_activity_ranking.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- 1. `member_activity_score()` menerima `p_max_score` opsyenal (lalai NULL =
--    tiada tapisan) untuk senarai Ahli Paling Tidak Aktif. Pengiraan markah
--    TIDAK berubah.
-- 2. `generasi_terbaik()` kini menjumlahkan total_score SEMUA ahli generasi
--    (bukan kiraan ahli aktif ikut ambang); `p_min_score` dibuang.
--
-- Tandatangan kedua-dua fungsi berubah, jadi versi lama dibuang dahulu —
-- membiarkan versi dua-parameter wujud bersama versi tiga-parameter berlalai
-- menjadikan panggilan `member_activity_score(a, b)` samar.
-- =============================================================================

drop function if exists public.generasi_terbaik(date, date, integer);
drop function if exists public.member_activity_score(date, date);


-- 1. MARKAH SETIAP AHLI ------------------------------------------------------------

create or replace function public.member_activity_score(
  p_start_date date,
  p_end_date   date,
  p_max_score  integer default null
)
returns table (
  nombor_ahli         text,
  full_name           text,
  generasi            text,
  yuran_lunas         integer,
  pipis_sumbang       integer,
  usrah_bulan         integer,
  ada_jawatan_org     integer,
  ada_jawatan_pas     integer,
  total_score         integer,
  pipis_amount_period numeric,
  member_id           uuid,
  avatar_url          text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_end_year    integer;
  v_start_month integer;
  v_end_month   integer;
begin
  if not coalesce(public.has_department_access('LAJNAH PEMBANGUNAN GENERASI', false), false) then
    raise exception 'Anda tiada kebenaran melihat penarafan aktiviti ahli.' using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Tempoh tidak sah: tarikh tamat mesti pada atau selepas tarikh mula.' using errcode = '22023';
  end if;

  v_end_year    := extract(year from p_end_date)::int;
  -- Bulan sebagai satu nombor (tahun × 12 + bulan) supaya julat merentas tahun mudah dibanding.
  v_start_month := extract(year from p_start_date)::int * 12 + extract(month from p_start_date)::int;
  v_end_month   := v_end_year * 12 + extract(month from p_end_date)::int;

  return query
  with
  /*
    KOMPONEN 1 — yuran_lunas (0/1)
    Logik sama seperti `yuran_member_summary()`: tertunggak = jumlah amount_due
    ledger − jumlah bayaran. Dihadkan kepada TAHUN ≤ tahun tarikh akhir, kerana
    ledger dan bayaran direkod mengikut tahun yuran (`created_at` bayaran ialah
    tarikh import, bukan tarikh bayar). Ahli tanpa sebarang baris ledger dalam
    julat itu tidak dikira lunas — tiada rekod bukan bukti lunas.
  */
  yuran_due as (
    select l.member_id as mid, sum(l.amount_due) as jumlah
    from public.yuran_ledger l
    where l.year <= v_end_year
    group by l.member_id
  ),
  yuran_paid as (
    select p.member_id as mid, sum(p.amount) as jumlah
    from public.yuran_payments p
    where p.year <= v_end_year
    group by p.member_id
  ),
  komponen_yuran as (
    select d.mid, case when d.jumlah - coalesce(p.jumlah, 0) <= 0 then 1 else 0 end as markah
    from yuran_due d
    left join yuran_paid p on p.mid = d.mid
  ),

  /*
    KOMPONEN 2 — pipis_sumbang (0/1) + pipis_amount_period (pemecah seri)
    1 markah jika ada sekurang-kurangnya satu sumbangan amount > 0 yang
    `created_at`nya (waktu Malaysia) dalam tempoh. Jumlah tempoh termasuk
    pelarasan negatif, dan TIDAK masuk ke total_score.
  */
  komponen_pipis as (
    select
      c.member_id as mid,
      max(case when c.amount > 0 then 1 else 0 end) as markah,
      sum(c.amount) as jumlah
    from public.pipis_contributions c
    where (c.created_at at time zone 'Asia/Kuala_Lumpur')::date between p_start_date and p_end_date
    group by c.member_id
  ),

  /*
    KOMPONEN 3 — usrah_bulan (0 hingga 12 × bilangan tahun)
    1 markah setiap bulan `attended = true` yang (tahun, bulan)nya bertindih
    dengan tempoh. Bulan separa dikira penuh.
  */
  komponen_usrah as (
    select a.member_id as mid, count(*)::int as markah
    from public.usrah_monthly_attendance a
    where a.attended
      and a.year * 12 + a.month between v_start_month and v_end_month
    group by a.member_id
  ),

  /*
    KOMPONEN 4 — ada_jawatan_org (0/1)
    Status SEMASA dalam Carta Organisasi — tidak terikat tempoh.
  */
  komponen_org as (
    select distinct o.member_id as mid, 1 as markah
    from public.org_positions o
    where o.member_id is not null
  ),

  /*
    KOMPONEN 5 — ada_jawatan_pas (0/1)
    Status SEMASA: mana-mana jawatan_pas_1/2/3 berisi (rentetan kosong tidak dikira).
  */
  komponen_pas as (
    select m.id as mid, 1 as markah
    from public.members m
    where nullif(btrim(coalesce(m.jawatan_pas_1, '')), '') is not null
       or nullif(btrim(coalesce(m.jawatan_pas_2, '')), '') is not null
       or nullif(btrim(coalesce(m.jawatan_pas_3, '')), '') is not null
  ),

  gabung as (
    select
      m.id,
      m.nombor_ahli,
      m.full_name,
      m.generasi,
      m.avatar_url,
      coalesce(ky.markah, 0)   as s_yuran,
      coalesce(kp.markah, 0)   as s_pipis,
      coalesce(ku.markah, 0)   as s_usrah,
      coalesce(ko.markah, 0)   as s_org,
      coalesce(kpas.markah, 0) as s_pas,
      coalesce(kp.jumlah, 0)   as pipis_jumlah
    from public.members m
    left join komponen_yuran ky   on ky.mid = m.id
    left join komponen_pipis kp   on kp.mid = m.id
    left join komponen_usrah ku   on ku.mid = m.id
    left join komponen_org ko     on ko.mid = m.id
    left join komponen_pas kpas   on kpas.mid = m.id
  )
  select
    g.nombor_ahli,
    g.full_name,
    g.generasi,
    g.s_yuran::int,
    g.s_pipis::int,
    g.s_usrah::int,
    g.s_org::int,
    g.s_pas::int,
    (g.s_yuran + g.s_pipis + g.s_usrah + g.s_org + g.s_pas)::int,
    g.pipis_jumlah::numeric,
    g.id,
    g.avatar_url
  from gabung g
  -- NULL = tiada tapisan (penarafan penuh); nilai = senarai ahli tidak aktif.
  where p_max_score is null
     or (g.s_yuran + g.s_pipis + g.s_usrah + g.s_org + g.s_pas) <= p_max_score
  order by
    (g.s_yuran + g.s_pipis + g.s_usrah + g.s_org + g.s_pas) desc,
    g.pipis_jumlah desc,
    g.full_name;
end;
$$;

revoke all on function public.member_activity_score(date, date, integer) from public, anon;
grant execute on function public.member_activity_score(date, date, integer) to authenticated;


-- 2. GENERASI TERBAIK ----------------------------------------------------------------
--
-- Jumlah total_score SEMUA ahli generasi. Generasi besar semula jadi mendapat
-- jumlah lebih tinggi, jadi purata dipulangkan sebagai konteks. Seri dipecahkan
-- oleh jumlah PIPIS generasi dalam tempoh. Ahli tanpa generasi = baris NULL.

create or replace function public.generasi_terbaik(p_start_date date, p_end_date date)
returns table (
  generasi               text,
  jumlah_markah_generasi integer,
  jumlah_ahli_generasi   integer,
  purata_markah          numeric,
  jumlah_pipis_generasi  numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not coalesce(public.has_department_access('LAJNAH PEMBANGUNAN GENERASI', false), false) then
    raise exception 'Anda tiada kebenaran melihat penarafan aktiviti ahli.' using errcode = '42501';
  end if;

  return query
  select
    s.generasi,
    sum(s.total_score)::int,
    count(*)::int,
    round(sum(s.total_score)::numeric / nullif(count(*), 0), 2),
    coalesce(sum(s.pipis_amount_period), 0)
  from public.member_activity_score(p_start_date, p_end_date) s
  group by s.generasi
  order by
    sum(s.total_score) desc,
    coalesce(sum(s.pipis_amount_period), 0) desc,
    s.generasi nulls last;
end;
$$;

revoke all on function public.generasi_terbaik(date, date) from public, anon;
grant execute on function public.generasi_terbaik(date, date) to authenticated;

notify pgrst, 'reload schema';
