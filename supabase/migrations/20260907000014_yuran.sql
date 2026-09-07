-- =============================================================================
-- mysaf-off — Yuran keahlian
--
-- Jalankan SELEPAS 20260907000013_temp_password_and_announcement_window.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Dua table, bukan satu kolum "baki". Baki ialah jawapan yang DIKIRA daripada
-- dua senarai: apa yang dicaj, dan apa yang dibayar. Menyimpannya sebagai
-- nombor bermakna setiap pembetulan menulis ganti sejarah, dan soalan "kenapa
-- dia berhutang RM120" tidak lagi ada jawapan.
--
-- Modul ini dimiliki oleh BENDAHARI, department yang sudah wujud dalam seed
-- 20260906000001 — tiada department baharu diperkenalkan, dan tiada mekanisme
-- kebenaran baharu: `has_department_access()` sedia ada dengan nama yang lain.
-- =============================================================================


-- =============================================================================
-- 1. TABLE yuran_ledger — apa yang DICAJ
--
-- Satu baris = satu ahli, satu tahun. `unique (member_id, year)` yang
-- menjadikan penjanaan tahunan boleh diulang tanpa mencaj seseorang dua kali.
-- =============================================================================

create table if not exists public.yuran_ledger (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  year       int  not null check (year between 2000 and 2100),
  amount_due numeric(10, 2) not null default 0 check (amount_due >= 0),

  /*
    Baris 2025 datang daripada laporan bendahari dan MERANGKUMI hutang
    terkumpul bertahun-tahun sebelumnya — ia bukan caj RM30 bagi satu tahun.
    Bendera ini yang membezakannya, supaya laporan tidak salah membacanya
    sebagai yuran tahunan biasa.
  */
  is_opening_balance boolean not null default false,

  created_at timestamptz not null default now(),

  unique (member_id, year)
);

create index if not exists yuran_ledger_member_idx on public.yuran_ledger (member_id, year);
create index if not exists yuran_ledger_year_idx   on public.yuran_ledger (year);


-- =============================================================================
-- 2. TABLE yuran_payments — apa yang DIBAYAR
--
-- `amount` bertanda: POSITIF ialah bayaran atau kredit, NEGATIF ialah caj
-- tambahan. Satu kolum dan bukan dua kerana setiap pengiraan yang wujud ialah
-- satu hasil tambah — dua kolum bermakna setiap satu daripadanya perlu ingat
-- untuk menolak yang kedua.
--
-- Tiada `unique` di sini, dengan sengaja: seorang ahli boleh membayar berkali
-- dalam satu tahun, dan setiap bayaran ialah peristiwa berasingan.
-- =============================================================================

create table if not exists public.yuran_payments (
  id        uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  year      int  not null check (year between 2000 and 2100),
  amount    numeric(10, 2) not null,

  method text not null check (method in ('import_opening', 'import', 'manual_adjustment')),
  note   text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists yuran_payments_member_idx on public.yuran_payments (member_id, year);

/*
  Import baki permulaan mesti boleh dijalankan berulang tanpa menggandakan
  kredit. Index separa ini menjadikan "satu baris import_opening bagi satu ahli
  satu tahun" satu peraturan pangkalan data, jadi `on conflict` boleh
  menggantikannya dan bukan menambah baris kedua.

  Ia TIDAK terpakai kepada bayaran biasa atau pelarasan manual — kedua-duanya
  memang boleh berulang.
*/
create unique index if not exists yuran_payments_opening_once
  on public.yuran_payments (member_id, year)
  where method = 'import_opening';


-- =============================================================================
-- 3. KEBENARAN
--
-- `has_department_access()` sudah mengandungi laluan Super Admin DAN semakan
-- sekatan akaun, jadi kedua-duanya tidak diulang di sini.
-- =============================================================================

create or replace function public.can_view_yuran(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('BENDAHARI', false, uid);
$$;

create or replace function public.can_edit_yuran(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('BENDAHARI', true, uid);
$$;

revoke all on function public.can_view_yuran(uuid) from public, anon;
revoke all on function public.can_edit_yuran(uuid) from public, anon;
grant execute on function public.can_view_yuran(uuid) to authenticated;
grant execute on function public.can_edit_yuran(uuid) to authenticated;


-- =============================================================================
-- 4. ROW LEVEL SECURITY
--
-- Ahli MELIHAT rekodnya sendiri tetapi tidak boleh menulis apa-apa. Yuran ialah
-- catatan yang dibuat oleh Bendahari tentang seseorang, bukan tuntutan yang
-- dibuat oleh orang itu sendiri — bentuk yang sama seperti kehadiran usrah.
-- =============================================================================

alter table public.yuran_ledger enable row level security;
alter table public.yuran_payments enable row level security;

drop policy if exists yuran_ledger_select on public.yuran_ledger;
create policy yuran_ledger_select on public.yuran_ledger
  for select to authenticated
  using (
    public.can_view_yuran()
    or (not public.my_account_suspended() and member_id = public.my_member_id())
  );

drop policy if exists yuran_ledger_insert on public.yuran_ledger;
create policy yuran_ledger_insert on public.yuran_ledger
  for insert to authenticated with check (public.can_edit_yuran());

drop policy if exists yuran_ledger_update on public.yuran_ledger;
create policy yuran_ledger_update on public.yuran_ledger
  for update to authenticated using (public.can_edit_yuran()) with check (public.can_edit_yuran());

drop policy if exists yuran_ledger_delete on public.yuran_ledger;
create policy yuran_ledger_delete on public.yuran_ledger
  for delete to authenticated using (public.can_edit_yuran());

drop policy if exists yuran_payments_select on public.yuran_payments;
create policy yuran_payments_select on public.yuran_payments
  for select to authenticated
  using (
    public.can_view_yuran()
    or (not public.my_account_suspended() and member_id = public.my_member_id())
  );

drop policy if exists yuran_payments_insert on public.yuran_payments;
create policy yuran_payments_insert on public.yuran_payments
  for insert to authenticated with check (public.can_edit_yuran());

drop policy if exists yuran_payments_update on public.yuran_payments;
create policy yuran_payments_update on public.yuran_payments
  for update to authenticated using (public.can_edit_yuran()) with check (public.can_edit_yuran());

drop policy if exists yuran_payments_delete on public.yuran_payments;
create policy yuran_payments_delete on public.yuran_payments
  for delete to authenticated using (public.can_edit_yuran());

grant select, insert, update, delete on public.yuran_ledger   to authenticated;
grant select, insert, update, delete on public.yuran_payments to authenticated;


-- =============================================================================
-- 5. JANA YURAN SATU TAHUN
--
-- `p_year <= 2025` DITOLAK. 2025 ialah tahun baki permulaan — barisnya membawa
-- hutang terkumpul daripada laporan bendahari, bukan caj RM30. Menjana ke atas
-- tahun itu akan menimpa angka yang tidak boleh dikira semula daripada apa-apa
-- yang ada dalam sistem ini.
--
-- Idempotent melalui `on conflict do nothing`, dan bukan melalui semakan
-- `not exists` yang berasingan: dua admin yang menekan butang serentak akan
-- melepasi semakan itu bersama-sama.
-- =============================================================================

create or replace function public.generate_yuran_year(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  if not public.can_edit_yuran() then
    raise exception 'Menjana yuran memerlukan kebenaran menyunting pada department BENDAHARI.'
      using errcode = 'MS001';
  end if;

  if p_year <= 2025 then
    raise exception 'Tahun % ialah tahun baki permulaan. Gunakan Import Baki Permulaan 2025, bukan penjanaan.', p_year
      using errcode = 'MS003';
  end if;

  if p_year > 2100 then
    raise exception 'Tahun tidak sah.' using errcode = 'MS003';
  end if;

  insert into public.yuran_ledger (member_id, year, amount_due, is_opening_balance)
  select m.id, p_year, 30, false
  from public.members m
  on conflict (member_id, year) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.generate_yuran_year(int) from public, anon;
grant execute on function public.generate_yuran_year(int) to authenticated;


-- =============================================================================
-- 6. RINGKASAN SEORANG AHLI
--
-- Baki dikira merentasi KESELURUHAN sejarah dan bukan tahun demi tahun:
-- lebihan bayaran tahun lalu menolak hutang tahun ini, kerana itulah yang
-- berlaku pada wang sebenar. Baris tahunan yang turut dipulangkan ialah
-- pecahan untuk dibaca, bukan asas pengiraan.
--
-- `year = 0` membawa jumlah keseluruhan, supaya pemanggil mendapat kedua-dua
-- dalam satu perjalanan. Sifar tidak boleh bertembung dengan tahun sebenar
-- (kekangan menghadkannya kepada 2000–2100).
-- =============================================================================

create or replace function public.yuran_member_summary(p_member_id uuid)
returns table (
  year        int,
  amount_due  numeric,
  total_paid  numeric,
  baki        numeric,
  is_opening_balance boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.yuran_member_summary(uuid) from public, anon;
grant execute on function public.yuran_member_summary(uuid) to authenticated;


-- =============================================================================
-- 7. LAPORAN SETAHUN
--
-- Ikut pola `usrah_year_report()`: admin BENDAHARI belum tentu memegang
-- kebenaran membaca `members` (itu milik JABATAN DATA & SUMBER MANUSIA), jadi
-- `security definer` merapatkan jurang itu dengan tepat — tiga kolum
-- pengenalan sahaja, dan hanya kepada sesiapa yang sudah dibenarkan melihat
-- rekod yuran.
--
-- `tertunggak` ialah baki KESELURUHAN dan bukan baki tahun `p_year` sahaja.
-- Soalan yang ditanya bendahari ketika membuka laporan ialah "siapa berhutang",
-- dan hutang tidak berhenti di sempadan tahun.
-- =============================================================================

/*
  Bentuk pulangan berubah (menambah `member_id`), jadi fungsi digugurkan dahulu —
  `create or replace` tidak boleh menukar senarai kolum yang dipulangkan.
*/
drop function if exists public.yuran_year_report(int);

create or replace function public.yuran_year_report(p_year int)
returns table (
  /*
    Diperlukan oleh skrin senarai untuk membuka butiran seorang ahli. Admin
    BENDAHARI tidak boleh SELECT `members`, jadi tanpa id di sini skrin itu
    tiada cara mencari semula orang yang baru sahaja diketuk.
  */
  member_id   uuid,
  nombor_ahli text,
  full_name   text,
  generasi    text,
  caj_tahun   numeric,
  bayar_tahun numeric,
  tertunggak  numeric,
  kredit      numeric,
  status      text
)
language sql
stable
security definer
set search_path = public
as $$
  with baki as (
    select
      m.id,
      m.nombor_ahli,
      m.full_name,
      m.generasi,
      coalesce((select sum(l.amount_due) from public.yuran_ledger l where l.member_id = m.id), 0)
        - coalesce((select sum(p.amount) from public.yuran_payments p where p.member_id = m.id), 0)
        as net,
      coalesce((select sum(l.amount_due) from public.yuran_ledger l where l.member_id = m.id and l.year = p_year), 0)
        as caj_tahun,
      coalesce((select sum(p.amount) from public.yuran_payments p where p.member_id = m.id and p.year = p_year), 0)
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
$$;

revoke all on function public.yuran_year_report(int) from public, anon;
grant execute on function public.yuran_year_report(int) to authenticated;


-- =============================================================================
-- 8. IMPORT BAKI PERMULAAN 2025
--
-- Satu panggilan, satu ahli, dan BOLEH DIULANG. Import fail 310 baris akan
-- dijalankan semula — selepas nama dibetulkan, selepas kegagalan separa — dan
-- larian kedua mesti MENGGANTIKAN angka ahli itu, bukan menambahnya.
--
-- Sebab itu kedua-dua tulisan menggunakan `on conflict ... do update` terhadap
-- kekangan yang sudah wujud, dan bukan "padam dahulu, masukkan kemudian":
-- pelarasan manual yang dibuat bendahari selepas import pertama TIDAK boleh
-- hilang hanya kerana fail yang sama dimuat naik semula.
-- =============================================================================

create or replace function public.import_yuran_opening(
  p_member_id  uuid,
  p_year       int,
  p_amount_due numeric,
  p_paid       numeric,
  p_note       text default 'Baki permulaan dari laporan 2025'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_yuran() then
    raise exception 'Import baki permulaan memerlukan kebenaran menyunting pada department BENDAHARI.'
      using errcode = 'MS001';
  end if;

  insert into public.yuran_ledger (member_id, year, amount_due, is_opening_balance)
  values (p_member_id, p_year, p_amount_due, true)
  on conflict (member_id, year) do update
    set amount_due = excluded.amount_due,
        is_opening_balance = true;

  /*
    Baris bayaran hanya wujud apabila ada sesuatu untuk direkod. Import ulangan
    yang kini membawa sifar akan MEMADAM baris lama — tanpa itu, pembetulan
    dalam fail sumber tidak akan pernah menurunkan angka yang sudah tersimpan.
  */
  if coalesce(p_paid, 0) <> 0 then
    insert into public.yuran_payments (member_id, year, amount, method, note, created_by)
    values (p_member_id, p_year, p_paid, 'import_opening', p_note, auth.uid())
    on conflict (member_id, year) where method = 'import_opening' do update
      set amount = excluded.amount,
          note = excluded.note,
          created_by = excluded.created_by,
          created_at = now();
  else
    delete from public.yuran_payments
    where member_id = p_member_id and year = p_year and method = 'import_opening';
  end if;
end;
$$;

revoke all on function public.import_yuran_opening(uuid, int, numeric, numeric, text) from public, anon;
grant execute on function public.import_yuran_opening(uuid, int, numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';
