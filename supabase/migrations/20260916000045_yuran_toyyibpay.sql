-- =============================================================================
-- mysaf-off — Bayaran Yuran Tahunan melalui ToyyibPay
--
-- Jalankan SELEPAS 20260916000044_pipis_toyyibpay.sql. Idempotent.
--
-- Bentuk yang SAMA seperti pipis_contributions: kolum status,
-- requested_amount, gateway_bill_code, gateway_reference dengan nama dan makna
-- yang sama, supaya satu Edge Function toyyibpay-callback boleh menyelaraskan
-- kedua-dua table tanpa cabang khas. Tiada table gateway_transactions
-- berasingan: setiap baris bayaran sudah pun membawa rujukannya sendiri, dan
-- table ketiga hanya menambah satu lagi tempat untuk menjadi tidak selaras.
--
-- Lalai status di sini 'success' (bukan 'pending' seperti PIPIS): setiap penulis
-- selain gateway — pelarasan admin, import baki permulaan — terus sah tanpa
-- trigger, dan create-yuran-bill menyatakan 'pending' secara eksplisit.
-- =============================================================================

alter table public.yuran_payments
  add column if not exists status text not null default 'success',
  add column if not exists requested_amount numeric(10, 2),
  add column if not exists gateway_bill_code text;

alter table public.yuran_payments alter column status set default 'success';

alter table public.yuran_payments drop constraint if exists yuran_payments_status_check;
alter table public.yuran_payments add constraint yuran_payments_status_check
  check (status in ('pending', 'success', 'failed'));

-- Hanya bayaran gateway boleh belum disahkan, dan yang belum sah WAJIB RM0.
alter table public.yuran_payments drop constraint if exists yuran_payments_status_method_check;
alter table public.yuran_payments add constraint yuran_payments_status_method_check
  check (method = 'gateway' or status = 'success');

alter table public.yuran_payments drop constraint if exists yuran_payments_unconfirmed_zero_check;
alter table public.yuran_payments add constraint yuran_payments_unconfirmed_zero_check
  check (status = 'success' or amount = 0);

drop index if exists public.yuran_payments_gateway_ref_idx;
create unique index if not exists yuran_payments_gateway_ref_key
  on public.yuran_payments (gateway_reference)
  where gateway_reference is not null;


-- =============================================================================
-- Jumlah dibayar hanya daripada status = 'success'.
-- Definisi di bawah disalin daripada pangkalan data semasa; yang berubah hanya
-- penapis status.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.yuran_member_summary(p_member_id uuid)
 RETURNS TABLE(year integer, amount_due numeric, total_paid numeric, baki numeric, is_opening_balance boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  /*
    `coalesce(..., false)` dan bukan `not (a or b)` sahaja.

    `p_member_id = my_member_id()` menghasilkan NULL apabila salah satu daripadanya
    NULL — dan `if NULL then` tidak mengambil cabang itu, jadi versi tanpa
    coalesce membenarkan panggilan dengan id NULL melepasi pengadang sepenuhnya.
    Ia tidak membocorkan apa-apa (tiada baris sepadan dengan NULL), tetapi
    pengadang yang boleh dilangkau bukan pengadang.
  */
  if not coalesce(public.can_view_yuran() or p_member_id = public.my_member_id(), false) then
    raise exception 'Anda tiada kebenaran melihat rekod yuran ahli ini.' using errcode = 'MS001';
  end if;

  return query
  with due as (
    select l.year, l.amount_due, l.is_opening_balance
    from public.yuran_ledger l
    where l.member_id = p_member_id
  ),
  paid as (
    select p.year, sum(p.amount) as total
    from public.yuran_payments p
    where p.member_id = p_member_id
      and p.status = 'success'
    group by p.year
  ),
  tahunan as (
    select
      coalesce(d.year, p.year)                    as year,
      coalesce(d.amount_due, 0)                   as amount_due,
      coalesce(p.total, 0)                        as total_paid,
      coalesce(d.amount_due, 0) - coalesce(p.total, 0) as baki,
      coalesce(d.is_opening_balance, false)       as is_opening_balance
    from due d
    full outer join paid p on p.year = d.year
  )
  -- Jumlah keseluruhan dahulu, kemudian setiap tahun mengikut urutan.
  select 0, sum(t.amount_due), sum(t.total_paid), sum(t.baki), false from tahunan t
  having count(*) > 0
  union all
  select t.year, t.amount_due, t.total_paid, t.baki, t.is_opening_balance from tahunan t
  order by 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.yuran_year_report(p_year integer)
 RETURNS TABLE(member_id uuid, nombor_ahli text, full_name text, generasi text, caj_tahun numeric, bayar_tahun numeric, tertunggak numeric, kredit numeric, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with baki as (
    select
      m.id,
      m.nombor_ahli,
      m.full_name,
      m.generasi,
      coalesce((select sum(l.amount_due) from public.yuran_ledger l where l.member_id = m.id), 0)
        - coalesce((select sum(p.amount) from public.yuran_payments p where p.member_id = m.id and p.status = 'success'), 0)
        as net,
      coalesce((select sum(l.amount_due) from public.yuran_ledger l where l.member_id = m.id and l.year = p_year), 0)
        as caj_tahun,
      coalesce((select sum(p.amount) from public.yuran_payments p where p.member_id = m.id and p.year = p_year and p.status = 'success'), 0)
        as bayar_tahun
    from public.members m
    where public.can_view_yuran()
  )
  select
    b.id,
    b.nombor_ahli,
    b.full_name,
    b.generasi,
    b.caj_tahun,
    b.bayar_tahun,
    -- Hutang dan kredit dipisahkan supaya satu kolum tidak perlu dibaca dengan
    -- tandanya; nombor negatif dalam ruangan "tertunggak" sentiasa disalah baca.
    greatest(b.net, 0)  as tertunggak,
    greatest(-b.net, 0) as kredit,
    case
      when b.net > 0 then 'Tertunggak'
      when b.net < 0 then 'Kredit'
      else 'Lunas'
    end as status
  from baki b
  order by b.nombor_ahli nulls last, b.full_name;
$function$;

-- activity_scores_internal: versi 000044 + penapis status pada yuran_paid.
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
  from gabung g;
end;
$function$;

notify pgrst, 'reload schema';
