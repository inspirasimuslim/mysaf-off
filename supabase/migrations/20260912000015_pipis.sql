-- =============================================================================
-- mysaf-off — Sumbangan PIPIS ASET
--
-- Jalankan SELEPAS 20260907000014_yuran.sql. Skrip ini idempotent: selamat
-- dijalankan semula.
--
-- PIPIS ialah sumbangan SEKALI SEUMUR HIDUP dengan sasaran RM5,000 seorang.
-- Ia bukan yuran: tiada tahun, tiada caj berulang, dan tiada siling. Seseorang
-- yang menyumbang RM12,266 memang menyumbang lebih daripada sasaran, dan
-- angka itu dibiarkan seperti adanya — melantainya pada 100% akan memadam
-- kemurahan hati yang laporan ini sepatutnya tunjukkan.
--
-- Satu table sahaja, bukan dua seperti yuran. Yuran memerlukan dua senarai
-- kerana ada dua perkara berbeza untuk dijejaki: apa yang DICAJ dan apa yang
-- DIBAYAR. Di sini hanya ada satu — apa yang DISUMBANG — dan sasaran RM5,000
-- ialah pemalar yang sama bagi semua orang, jadi menyimpannya sebagai baris
-- pangkalan data hanya menambah tempat untuk ia menjadi tidak selaras.
--
-- Modul ini dimiliki oleh LAJNAH EKONOMI DAN ASET, department yang sudah wujud
-- dalam seed 20260906000001 — tiada mekanisme kebenaran baharu diperkenalkan,
-- hanya `has_department_access()` sedia ada dengan nama yang lain.
-- =============================================================================


-- =============================================================================
-- 1. DEPARTMENT PEMILIK
--
-- Sepatutnya sudah ada daripada seed 13 department asal. Insert bersyarat ini
-- ialah jaring keselamatan untuk pangkalan data yang seedingnya tidak lengkap:
-- tanpa baris ini, `can_view_pipis()` akan sentiasa palsu dan modul menjadi
-- tidak boleh dicapai oleh sesiapa kecuali Super Admin, tanpa sebarang petunjuk
-- mengapa.
-- =============================================================================

insert into public.departments (name)
values ('LAJNAH EKONOMI DAN ASET')
on conflict (name) do nothing;


-- =============================================================================
-- 2. TABLE pipis_contributions
--
-- `amount` bertanda: POSITIF ialah sumbangan, NEGATIF ialah pelarasan tolak.
-- Satu kolum dan bukan dua atas sebab yang sama seperti `yuran_payments` —
-- setiap pengiraan yang wujud ialah satu hasil tambah, dan dua kolum bermakna
-- setiap satu daripadanya perlu ingat untuk menolak yang kedua.
--
-- Tiada `unique` pada (member_id): seorang ahli boleh menyumbang berkali-kali,
-- dan setiap sumbangan ialah peristiwa berasingan yang patut kekal dalam
-- sejarah.
-- =============================================================================

create table if not exists public.pipis_contributions (
  id        uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  amount    numeric(10, 2) not null,

  method text not null check (method in ('import', 'manual_adjustment')),
  note   text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pipis_contributions_member_idx
  on public.pipis_contributions (member_id, created_at desc);


-- =============================================================================
-- 3. KEBENARAN
--
-- `has_department_access()` sudah mengandungi laluan Super Admin DAN semakan
-- sekatan akaun, jadi kedua-duanya tidak diulang di sini.
-- =============================================================================

create or replace function public.can_view_pipis(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH EKONOMI DAN ASET', false, uid);
$$;

create or replace function public.can_edit_pipis(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH EKONOMI DAN ASET', true, uid);
$$;

revoke all on function public.can_view_pipis(uuid) from public, anon;
revoke all on function public.can_edit_pipis(uuid) from public, anon;
grant execute on function public.can_view_pipis(uuid) to authenticated;
grant execute on function public.can_edit_pipis(uuid) to authenticated;


-- =============================================================================
-- 4. ROW LEVEL SECURITY
--
-- Ahli MELIHAT rekodnya sendiri tetapi tidak boleh menulis apa-apa. Sumbangan
-- ialah catatan yang dibuat oleh Lajnah Ekonomi tentang seseorang, bukan
-- tuntutan yang dibuat oleh orang itu sendiri — bentuk yang sama seperti yuran
-- dan kehadiran usrah.
-- =============================================================================

alter table public.pipis_contributions enable row level security;

drop policy if exists pipis_contributions_select on public.pipis_contributions;
create policy pipis_contributions_select on public.pipis_contributions
  for select to authenticated
  using (
    public.can_view_pipis()
    or (not public.my_account_suspended() and member_id = public.my_member_id())
  );

drop policy if exists pipis_contributions_insert on public.pipis_contributions;
create policy pipis_contributions_insert on public.pipis_contributions
  for insert to authenticated with check (public.can_edit_pipis());

drop policy if exists pipis_contributions_update on public.pipis_contributions;
create policy pipis_contributions_update on public.pipis_contributions
  for update to authenticated using (public.can_edit_pipis()) with check (public.can_edit_pipis());

drop policy if exists pipis_contributions_delete on public.pipis_contributions;
create policy pipis_contributions_delete on public.pipis_contributions
  for delete to authenticated using (public.can_edit_pipis());

grant select, insert, update, delete on public.pipis_contributions to authenticated;


-- =============================================================================
-- 5. SASARAN
--
-- Satu fungsi dan bukan nombor yang ditulis semula di lima tempat. Sasaran
-- muncul dalam ringkasan, dalam laporan, dan dalam setiap label skrin; bila ia
-- berubah, ia patut berubah sekali.
-- =============================================================================

create or replace function public.pipis_target()
returns numeric
language sql
immutable
as $$
  select 5000::numeric;
$$;

grant execute on function public.pipis_target() to authenticated;


-- =============================================================================
-- 6. RINGKASAN SEORANG AHLI
--
-- Peratus TIDAK dihadkan pada 100. Sumbangan RM12,266 ialah 245%, dan itu
-- fakta yang skrin ahli patut boleh papar.
--
-- Ahli tanpa sebarang rekod mendapat baris sifar dan bukan set kosong: skrin
-- yang bertanya "berapa saya sudah sumbang" patut mendapat jawapan "RM0",
-- bukan ketiadaan jawapan yang setiap pemanggil perlu tafsir sendiri.
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
  /*
    `coalesce(..., false)` atas sebab yang sama seperti `yuran_member_summary`:
    `p_member_id = my_member_id()` menghasilkan NULL apabila salah satunya NULL,
    dan `if NULL then` tidak mengambil cabang itu — jadi versi tanpa coalesce
    membenarkan panggilan dengan id NULL melepasi pengadang sepenuhnya.
  */
  if not coalesce(public.can_view_pipis() or p_member_id = public.my_member_id(), false) then
    raise exception 'Anda tiada kebenaran melihat rekod sumbangan PIPIS ahli ini.' using errcode = 'MS001';
  end if;

  select coalesce(sum(c.amount), 0) into v_total
  from public.pipis_contributions c
  where c.member_id = p_member_id;

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


-- =============================================================================
-- 7. LAPORAN PENUH
--
-- Ikut pola `yuran_year_report()` — tetapi TANPA parameter tahun. PIPIS ialah
-- sumbangan sekali seumur hidup; memotongnya mengikut tahun akan menjawab
-- soalan yang tiada sesiapa tanya.
--
-- `security definer` atas sebab yang sama seperti laporan lain: admin LAJNAH
-- EKONOMI DAN ASET belum tentu memegang kebenaran membaca `members` (itu milik
-- JABATAN DATA & SUMBER MANUSIA), jadi fungsi ini mendedah empat kolum
-- pengenalan sahaja, dan hanya kepada sesiapa yang sudah dibenarkan melihat
-- rekod PIPIS.
--
-- SEMUA ahli dipulangkan, termasuk yang tiada rekod langsung. Laporan ini
-- dibuka untuk bertanya "siapa belum menyumbang", dan orang itu tidak akan
-- muncul dalam laporan yang hanya menyenaraikan penyumbang.
-- =============================================================================

drop function if exists public.pipis_full_report();

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
      coalesce((select sum(c.amount) from public.pipis_contributions c where c.member_id = m.id), 0) as total
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


-- =============================================================================
-- 8. IMPORT SATU AHLI
--
-- Satu panggilan, satu ahli, dan BOLEH DIULANG. Fail import akan dijalankan
-- semula — selepas nama dibetulkan, selepas kegagalan separa — dan larian kedua
-- mesti MENGGANTIKAN angka ahli itu, bukan menambahnya di atas yang lama.
--
-- Penggantian dibuat dengan memadam baris `method = 'import'` ahli itu dahulu.
-- Pelarasan manual TIDAK disentuh: bila bendahari menulis potongan RM50 selepas
-- import pertama, muat naik semula fail yang sama tidak boleh memadamkannya.
--
-- Padam-kemudian-masukkan di sini dan bukan `on conflict` seperti yuran kerana
-- tiada kekangan unik untuk dilanggar: seorang ahli boleh mempunyai beberapa
-- baris sumbangan yang sah, jadi "satu baris import setiap ahli" ialah
-- peraturan import ini sendiri dan bukan bentuk table.
-- =============================================================================

create or replace function public.import_pipis_contribution(
  p_member_id uuid,
  p_amount    numeric,
  p_note      text default 'Import sumbangan PIPIS 2025'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_pipis() then
    raise exception 'Import sumbangan PIPIS memerlukan kebenaran menyunting pada department LAJNAH EKONOMI DAN ASET.'
      using errcode = 'MS001';
  end if;

  delete from public.pipis_contributions
  where member_id = p_member_id and method = 'import';

  /*
    Sifar TIDAK direkodkan. Baris RM0 tidak membawa maklumat yang jumlahnya
    tidak sudah katakan, tetapi ia muncul dalam sejarah ahli sebagai "sumbangan
    RM0.00" — catatan yang kelihatan seperti kesilapan kepada orang yang
    membacanya.
  */
  if coalesce(p_amount, 0) <> 0 then
    insert into public.pipis_contributions (member_id, amount, method, note, created_by)
    values (p_member_id, p_amount, 'import', p_note, auth.uid());
  end if;
end;
$$;

revoke all on function public.import_pipis_contribution(uuid, numeric, text) from public, anon;
grant execute on function public.import_pipis_contribution(uuid, numeric, text) to authenticated;

notify pgrst, 'reload schema';
