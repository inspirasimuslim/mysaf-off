-- =============================================================================
-- mysaf-off — Penarafan: Yuran Lunas = TIADA tunggakan (2026-11-21)
--
-- Masalah: semua ahli ditanda pangkah walaupun yuran lunas. Komponen 1 hanya
-- memberi markah kepada ahli yang ADA baris yuran_ledger; ahli tanpa baris
-- ledger (tiada tunggakan direkod) dianggap tidak lunas. Skrin Yuran/laporan
-- (`yuran_year_report`) menganggap mereka Lunas (baki 0).
--
-- Pembetulan: ahli tanpa baris ledger dalam julat kini dikira lunas (1), sama
-- seperti laporan Yuran. Ahli yang ada ledger kekal ikut baki (due - bayaran <= 0).
-- SEMENTARA (atas arahan pemilik): kekal sehingga ledger lengkap, kemudian dibuat semula dengan betul.
-- Selebihnya SALIN TEPAT daripada 138; bentuk output sama -> create or replace.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.activity_scores_internal(p_start_date date, p_end_date date)
 RETURNS TABLE(nombor_ahli text, full_name text, generasi text, yuran_lunas integer, pipis_sumbang integer, usrah_bulan integer, ada_jawatan_org integer, ada_jawatan_pas integer, total_score integer, pipis_amount_period numeric, member_id uuid, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_end_year    integer;
  v_start_month integer;
  v_end_month   integer;
begin
  v_end_year    := extract(year from p_end_date)::int;
  -- Bulan sebagai satu nombor (tahun x 12 + bulan) supaya julat merentas tahun mudah dibanding.
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
    where p.status = 'success'
      and p.year <= v_end_year
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
    where c.status = 'success'
      and (c.created_at at time zone 'Asia/Kuala_Lumpur')::date between p_start_date and p_end_date
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
    select distinct x.mid, 1 as markah
    from (
      select o.member_id as mid from public.org_positions o where o.member_id is not null
      union
      -- Rais/Raisah Generasi & Usrah Kawasan (rais_lantikan) turut dikira.
      select r.member_id from public.rais_lantikan r where r.member_id is not null
    ) x
  ),

  /*
    KOMPONEN 5 — ada_jawatan_pas (0/1)
    Status SEMASA: suis `jawatan_pas_aktif` (tab Komitmen) — true = 1 markah,
    false/null = 0. Tidak lagi membaca teks jawatan_pas_1/2.
  */
  komponen_pas as (
    select m.id as mid, 1 as markah
    from public.members m
    where coalesce(m.jawatan_pas_aktif, false)
  ),

  gabung as (
    select
      m.id,
      m.nombor_ahli,
      m.full_name,
      m.generasi,
      m.avatar_url,
      coalesce(ky.markah, 1)   as s_yuran,
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
  from gabung g;
end;
$function$;

revoke all on function public.activity_scores_internal(date, date) from public, anon, authenticated;

revoke all on function public.activity_scores_internal(date, date) from public, anon, authenticated;
