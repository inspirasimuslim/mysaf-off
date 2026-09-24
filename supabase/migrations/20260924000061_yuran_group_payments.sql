-- =============================================================================
-- mysaf-off — Bayaran Yuran Kumpulan ikut Generasi
--
-- Jalankan SELEPAS 20260924000060_documents_library.sql. Idempotent.
--
-- Bendahari merekod SATU bayaran untuk satu generasi/tahun. Ia dipecahkan kepada
-- satu baris `yuran_payments` (method='manual_adjustment') bagi setiap ahli
-- terpilih, semuanya menuding ke satu baris `yuran_group_payments` (batch).
-- Baki masih dikira daripada lejar + bayaran (lihat 20260907000014) — batch
-- hanyalah cara mengumpulkan dan membatalkan bayaran itu SEKALIGUS.
--
-- Cipta dan batal ialah RPC atomik (satu transaksi): butang yang terputus di
-- tengah jalan tidak boleh meninggalkan separuh batch. Trigger audit sedia ada
-- pada `yuran_payments` mencatat SETIAP baris manual_adjustment (INSERT dan
-- DELETE) — RPC ini menambah SATU baris ringkasan supaya log mudah dibaca.
-- =============================================================================


-- 1. TABLE + KOLUM ------------------------------------------------------------------

create table if not exists public.yuran_group_payments (
  id           uuid primary key default gen_random_uuid(),
  generasi     text not null,
  year         int  not null check (year between 2000 and 2100),
  total_amount numeric(10, 2) not null check (total_amount > 0),
  member_count int  not null check (member_count > 0),
  note         text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists yuran_group_payments_created_idx on public.yuran_group_payments (created_at desc);

-- Tiada `on delete cascade`: batch tidak boleh hilang sementara masih ada
-- bayaran yang menuding kepadanya. Pembatalan memadam bayaran dahulu.
alter table public.yuran_payments
  add column if not exists group_payment_id uuid references public.yuran_group_payments (id);

create index if not exists yuran_payments_group_idx on public.yuran_payments (group_payment_id)
  where group_payment_id is not null;


-- 2. RLS ----------------------------------------------------------------------------
--
-- can_view_yuran()/can_edit_yuran() sudah merangkumi Super Admin melalui
-- has_department_access(). Tiada UPDATE: jumlah batch tidak boleh disunting
-- selepas direkod (batalkan dan rekod semula).

alter table public.yuran_group_payments enable row level security;

drop policy if exists yuran_group_payments_select on public.yuran_group_payments;
create policy yuran_group_payments_select on public.yuran_group_payments
  for select to authenticated using (public.can_view_yuran());

drop policy if exists yuran_group_payments_insert on public.yuran_group_payments;
create policy yuran_group_payments_insert on public.yuran_group_payments
  for insert to authenticated with check (public.can_edit_yuran());

drop policy if exists yuran_group_payments_delete on public.yuran_group_payments;
create policy yuran_group_payments_delete on public.yuran_group_payments
  for delete to authenticated using (public.can_edit_yuran());

revoke all on public.yuran_group_payments from anon, authenticated;
grant select, insert, delete on public.yuran_group_payments to authenticated;


-- 3. SENARAI CALON ---------------------------------------------------------------------
--
-- Ahli AKTIF (tidak disekat) satu generasi + keadaan yuran TAHUN itu sebagai
-- konteks sahaja. Admin BENDAHARI tidak boleh SELECT `members`, jadi laluan
-- security definer ini mendedahkan lajur yang perlu sahaja, kepada can_view.

create or replace function public.yuran_group_candidates(p_generasi text, p_year int)
returns table (
  member_id   uuid,
  nombor_ahli text,
  full_name   text,
  caj_tahun   numeric,   -- NULL = tiada baris lejar untuk tahun itu
  bayar_tahun numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.can_view_yuran(), false) then
    raise exception 'Anda tiada kebenaran melihat rekod yuran.' using errcode = 'MS001';
  end if;

  return query
    select
      m.id,
      m.nombor_ahli,
      m.full_name,
      (select sum(l.amount_due) from public.yuran_ledger l where l.member_id = m.id and l.year = p_year),
      coalesce((select sum(p.amount) from public.yuran_payments p
                where p.member_id = m.id and p.year = p_year and p.status = 'success'), 0)
    from public.members m
    where m.generasi = p_generasi and not m.disekat
    order by m.nombor_ahli nulls last, m.full_name;
end;
$$;

revoke all on function public.yuran_group_candidates(text, int) from public, anon;
grant execute on function public.yuran_group_candidates(text, int) to authenticated;


-- 4. REKOD BATCH -----------------------------------------------------------------------
--
-- Jumlah dipecah kepada sen: setiap ahli mendapat floor(jumlah/bilangan) dan
-- baki sen yang tidak habis dibahagi diberi seorang satu sen kepada ahli-ahli
-- pertama (ikut nombor ahli), supaya JUMLAH per-ahli sentiasa TEPAT sama
-- dengan jumlah batch. Ahli mesti dalam generasi itu dan tidak disekat —
-- disemak di sini, bukan dipercayai daripada app.

create or replace function public.create_yuran_group_payment(
  p_generasi   text,
  p_year       int,
  p_member_ids uuid[],
  p_total      numeric,
  p_note       text default null
)
returns table (
  group_id      uuid,
  member_count  int,
  base_amount   numeric,   -- amaun setiap ahli sebelum sen lebihan
  extra_cents   int        -- bilangan ahli yang menerima +RM0.01
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids     uuid[];
  v_n       int;
  v_valid   int;
  v_cents   bigint;
  v_base    bigint;
  v_extra   int;
  v_group   uuid;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
  v_payment_note text;
begin
  if not coalesce(public.can_edit_yuran(), false) then
    raise exception 'Bayaran kumpulan memerlukan kebenaran menyunting pada department BENDAHARI.'
      using errcode = 'MS001';
  end if;

  if coalesce(trim(p_generasi), '') = '' then
    raise exception 'Generasi wajib dipilih.' using errcode = '22023';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Tahun tidak sah.' using errcode = '22023';
  end if;
  if p_total is null or p_total <= 0 or p_total > 1000000 then
    raise exception 'Jumlah mesti lebih daripada RM0.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Nota terlalu panjang (maksimum 500 aksara).' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_member_ids, '{}')) as x;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    raise exception 'Pilih sekurang-kurangnya seorang ahli.' using errcode = '22023';
  end if;
  if v_n > 1000 then
    raise exception 'Terlalu banyak ahli dalam satu batch.' using errcode = '22023';
  end if;

  select count(*) into v_valid
  from public.members m
  where m.id = any (v_ids) and m.generasi = p_generasi and not m.disekat;
  if v_valid <> v_n then
    raise exception 'Sebahagian ahli terpilih bukan ahli aktif generasi % (mungkin disekat atau bertukar generasi). Muat semula senarai.', p_generasi
      using errcode = '22023';
  end if;

  v_cents := round(p_total * 100)::bigint;
  v_base  := v_cents / v_n;
  v_extra := (v_cents - v_base * v_n)::int;

  insert into public.yuran_group_payments (generasi, year, total_amount, member_count, note, created_by)
  values (p_generasi, p_year, v_cents / 100.0, v_n, v_note, auth.uid())
  returning id into v_group;

  v_payment_note := 'Bayaran kumpulan generasi ' || p_generasi || ' ' || p_year
                    || coalesce(' — ' || v_note, '');

  insert into public.yuran_payments (member_id, year, amount, method, note, created_by, group_payment_id)
  select
    r.id, p_year,
    (v_base + case when r.rn <= v_extra then 1 else 0 end) / 100.0,
    'manual_adjustment', v_payment_note, auth.uid(), v_group
  from (
    select m.id, row_number() over (order by m.nombor_ahli nulls last, m.full_name, m.id) as rn
    from public.members m where m.id = any (v_ids)
  ) r;

  perform public.log_admin_activity(
    'Bayaran Kumpulan Yuran', 'yuran_group_payments', v_group::text,
    jsonb_strip_nulls(jsonb_build_object(
      'label', 'Generasi ' || p_generasi || ' · ' || p_year,
      'bilangan_ahli', v_n, 'jumlah', v_cents / 100.0, 'nota', v_note
    ))
  );

  return query select v_group, v_n, v_base / 100.0, v_extra;
end;
$$;

revoke all on function public.create_yuran_group_payment(text, int, uuid[], numeric, text) from public, anon;
grant execute on function public.create_yuran_group_payment(text, int, uuid[], numeric, text) to authenticated;


-- 5. BATALKAN BATCH ----------------------------------------------------------------------

create or replace function public.cancel_yuran_group_payment(p_group_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group   public.yuran_group_payments%rowtype;
  v_deleted int;
begin
  if not coalesce(public.can_edit_yuran(), false) then
    raise exception 'Membatalkan bayaran kumpulan memerlukan kebenaran menyunting pada department BENDAHARI.'
      using errcode = 'MS001';
  end if;

  select * into v_group from public.yuran_group_payments where id = p_group_id for update;
  if not found then
    raise exception 'Batch tidak dijumpai (mungkin sudah dibatalkan).' using errcode = 'P0002';
  end if;

  delete from public.yuran_payments where group_payment_id = p_group_id;
  get diagnostics v_deleted = row_count;

  delete from public.yuran_group_payments where id = p_group_id;

  perform public.log_admin_activity(
    'Batal Bayaran Kumpulan Yuran', 'yuran_group_payments', p_group_id::text,
    jsonb_build_object(
      'label', 'Generasi ' || v_group.generasi || ' · ' || v_group.year,
      'bilangan_rekod_dipadam', v_deleted, 'jumlah', v_group.total_amount
    )
  );

  return v_deleted;
end;
$$;

revoke all on function public.cancel_yuran_group_payment(uuid) from public, anon;
grant execute on function public.cancel_yuran_group_payment(uuid) to authenticated;


-- 6. SEJARAH ---------------------------------------------------------------------------

create or replace function public.yuran_group_payment_history()
returns table (
  id           uuid,
  generasi     text,
  year         int,
  total_amount numeric,
  member_count int,
  note         text,
  created_at   timestamptz,
  admin_name   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.can_view_yuran(), false) then
    raise exception 'Anda tiada kebenaran melihat rekod yuran.' using errcode = 'MS001';
  end if;

  return query
    select g.id, g.generasi, g.year, g.total_amount, g.member_count, g.note, g.created_at,
           public._audit_user_name(g.created_by)
    from public.yuran_group_payments g
    order by g.created_at desc;
end;
$$;

create or replace function public.yuran_group_payment_members(p_group_id uuid)
returns table (
  member_id   uuid,
  nombor_ahli text,
  full_name   text,
  amount      numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.can_view_yuran(), false) then
    raise exception 'Anda tiada kebenaran melihat rekod yuran.' using errcode = 'MS001';
  end if;

  return query
    select m.id, m.nombor_ahli, m.full_name, p.amount
    from public.yuran_payments p
    join public.members m on m.id = p.member_id
    where p.group_payment_id = p_group_id
    order by m.nombor_ahli nulls last, m.full_name;
end;
$$;

revoke all on function public.yuran_group_payment_history() from public, anon;
revoke all on function public.yuran_group_payment_members(uuid) from public, anon;
grant execute on function public.yuran_group_payment_history() to authenticated;
grant execute on function public.yuran_group_payment_members(uuid) to authenticated;

notify pgrst, 'reload schema';
