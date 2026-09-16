-- =============================================================================
-- mysaf-off — Bayaran PIPIS ASET melalui ToyyibPay
--
-- Jalankan SELEPAS 20260915000043_admin_activity_log.sql. Idempotent.
--
-- Skema gateway (method 'gateway', `gateway_reference`) sudah disediakan oleh
-- 20260912000016. Migration ini menambah apa yang hanya diperlukan bila wang
-- sebenar mula masuk melalui internet: STATUS.
--
-- Baris gateway dicipta SEBELUM ahli dihantar ke ToyyibPay (amount 0,
-- status 'pending'), dan hanya Edge Function `toyyibpay-callback` — selepas
-- bertanya semula kepada pelayan ToyyibPay — boleh menukarnya kepada 'success'
-- dengan amaun sebenar. Bil yang ditinggalkan atau gagal kekal di luar setiap
-- jumlah.
-- =============================================================================


-- =============================================================================
-- 1. KOLUM
--
-- `status` ditambah dengan lalai 'success' DAHULU supaya 269+ baris import dan
-- pelarasan sedia ada diisi sebagai sah, kemudian lalainya ditukar kepada
-- 'pending'. Menambahnya terus dengan lalai 'pending' akan mengosongkan jumlah
-- sumbangan setiap ahli dalam satu langkah.
--
-- `requested_amount` — amaun yang ahli PILIH sebelum membayar. `amount` kekal 0
-- sehingga disahkan, jadi tanpa kolum ini sejarah hanya boleh memaparkan
-- "RM0.00 · sedang diproses".
--
-- `gateway_bill_code` — BillCode ToyyibPay. Callback dipadankan pada KEDUA-DUA
-- rujukan kita dan bil ini, dan bil ini yang ditanya semula kepada ToyyibPay.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pipis_contributions' and column_name = 'status'
  ) then
    alter table public.pipis_contributions add column status text not null default 'success';
  end if;
end;
$$;

alter table public.pipis_contributions alter column status set default 'pending';

alter table public.pipis_contributions
  add column if not exists requested_amount numeric(10, 2),
  add column if not exists gateway_bill_code text;

alter table public.pipis_contributions drop constraint if exists pipis_contributions_status_check;
alter table public.pipis_contributions add constraint pipis_contributions_status_check
  check (status in ('pending', 'success', 'failed'));

/*
  Hanya bayaran gateway boleh belum disahkan — import dan pelarasan dicatat oleh
  bendahari selepas wang diterima. Dan baris yang belum/tidak berjaya WAJIB
  bernilai 0: jumlah yang terlepas penapis status di mana-mana laporan masa
  depan tetap betul.
*/
alter table public.pipis_contributions drop constraint if exists pipis_contributions_status_method_check;
alter table public.pipis_contributions add constraint pipis_contributions_status_method_check
  check (method = 'gateway' or status = 'success');

alter table public.pipis_contributions drop constraint if exists pipis_contributions_unconfirmed_zero_check;
alter table public.pipis_contributions add constraint pipis_contributions_unconfirmed_zero_check
  check (status = 'success' or amount = 0);

/*
  Satu baris untuk satu rujukan. Webhook boleh tiba berkali-kali; yang kedua
  mesti mengemas kini baris yang sama, bukan mencari dua.
*/
drop index if exists public.pipis_contributions_gateway_ref_idx;
create unique index if not exists pipis_contributions_gateway_ref_key
  on public.pipis_contributions (gateway_reference)
  where gateway_reference is not null;


-- =============================================================================
-- 2. LALAI STATUS MENGIKUT METHOD
--
-- Lalai kolum 'pending' betul untuk gateway sahaja. Build app yang sudah ada di
-- telefon admin memasukkan pelarasan TANPA menyebut status, dan
-- `import_pipis_contribution()` juga — kedua-duanya mesti terus dikira. Trigger
-- dan bukan mengubah setiap penulis, kerana app lama tidak boleh diubah.
-- =============================================================================

create or replace function public.pipis_contributions_default_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.method <> 'gateway' then
    new.status := 'success';
  end if;
  return new;
end;
$$;

revoke all on function public.pipis_contributions_default_status() from public, anon;

drop trigger if exists pipis_contributions_default_status on public.pipis_contributions;
create trigger pipis_contributions_default_status
  before insert on public.pipis_contributions
  for each row execute function public.pipis_contributions_default_status();


-- =============================================================================
-- 3. JUMLAH HANYA DARIPADA status = 'success'
--
-- Tiga fungsi yang menjumlahkan table ini. Kekangan di atas sudah menjamin
-- baris lain bernilai 0; penapis di sini menjadikan niatnya jelas dan
-- menghalang baris pending RM0 memberi markah "pernah menyumbang".
-- =============================================================================

create or replace function public.pipis_member_summary(p_member_id uuid)
returns table (
  jumlah  numeric,
  sasaran numeric,
  peratus numeric,
  status  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total  numeric;
  v_target numeric := public.pipis_target();
begin
  if not coalesce(public.can_view_pipis() or p_member_id = public.my_member_id(), false) then
    raise exception 'Anda tiada kebenaran melihat rekod sumbangan PIPIS ahli ini.' using errcode = 'MS001';
  end if;

  select coalesce(sum(c.amount), 0) into v_total
  from public.pipis_contributions c
  where c.member_id = p_member_id
    and c.status = 'success';

  return query
  select
    v_total,
    v_target,
    round(v_total / v_target * 100, 1),
    case
      when v_total > v_target then 'Lebih RM5000'
      when v_total = v_target then 'Cukup RM5000'
      else 'Belum Cukup'
    end;
end;
$$;

revoke all on function public.pipis_member_summary(uuid) from public, anon;
grant execute on function public.pipis_member_summary(uuid) to authenticated;

create or replace function public.pipis_full_report()
returns table (
  member_id   uuid,
  nombor_ahli text,
  full_name   text,
  generasi    text,
  jumlah      numeric,
  peratus     numeric,
  status      text
)
language sql
stable
security definer
set search_path = public
as $$
  with jumlah as (
    select
      m.id,
      m.nombor_ahli,
      m.full_name,
      m.generasi,
      coalesce((
        select sum(c.amount) from public.pipis_contributions c
        where c.member_id = m.id and c.status = 'success'
      ), 0) as total
    from public.members m
    where public.can_view_pipis()
  )
  select
    j.id,
    j.nombor_ahli,
    j.full_name,
    j.generasi,
    j.total,
    round(j.total / public.pipis_target() * 100, 1),
    case
      when j.total > public.pipis_target() then 'Lebih RM5000'
      when j.total = public.pipis_target() then 'Cukup RM5000'
      else 'Belum Cukup'
    end
  from jumlah j
  order by j.total desc, j.nombor_ahli nulls last, j.full_name;
$$;

revoke all on function public.pipis_full_report() from public, anon;
grant execute on function public.pipis_full_report() to authenticated;

-- activity_scores_internal: sama seperti 20260915000040, cuma komponen PIPIS
-- kini menapis status = 'success'.
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
