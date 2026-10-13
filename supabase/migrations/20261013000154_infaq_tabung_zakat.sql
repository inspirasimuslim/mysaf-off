-- =============================================================================
-- mysaf-off — Infaq Tabung Zakat (bayaran online ToyyibPay) — 2026-10-13
--
-- Infaq sukarela tanpa sasaran. Ahli membayar melalui ToyyibPay (Edge Function
-- `create-zakat-bill`, kongsi perkakas `_shared/toyyibpay.ts` dengan PIPIS dan Yuran);
-- ahli melihat sejarah bayarannya sendiri, admin TABUNG ZAKAT melihat SEMUA rekod dan
-- boleh memuat turun Excel. Corak status sama PIPIS: baris dicipta 'pending' (amount 0)
-- sebelum ahli dihantar ke ToyyibPay; HANYA `toyyibpay-callback`, selepas bertanya semula
-- kepada ToyyibPay, menukarnya 'success' dengan amaun sebenar.
--
--   * Table baharu `zakat_infaq`: SELECT sahaja untuk authenticated (pemilik ATAU admin
--     TABUNG ZAKAT can_view); tiada INSERT/UPDATE/DELETE — tulisan oleh Edge Function
--     (service role) dan RPC pembatalan.
--   * `cancel_pending_gateway_payment()` dilanjutkan (salinan tepat versi 046 + cabang baharu).
--   * RPC admin: `zakat_infaq_admin_list()` (semua rekod + nama ahli), `zakat_infaq_admin_summary()`.
-- Hanya menambah; tiada data sedia ada disentuh.
-- =============================================================================

create table if not exists public.zakat_infaq (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members(id) on delete restrict,
  amount            numeric(10, 2) not null default 0 check (amount >= 0),
  requested_amount  numeric(10, 2),
  method            text not null default 'gateway' check (method = 'gateway'),
  status            text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  gateway_reference text,
  gateway_bill_code text,
  note              text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  -- Baris belum/tidak berjaya WAJIB bernilai 0 (sama PIPIS): jumlah yang terlepas penapis tetap betul.
  constraint zakat_infaq_unconfirmed_zero_check check (status = 'success' or amount = 0)
);

create unique index if not exists zakat_infaq_gateway_ref_key
  on public.zakat_infaq (gateway_reference) where gateway_reference is not null;
create index if not exists zakat_infaq_member_idx on public.zakat_infaq (member_id, created_at desc);
create index if not exists zakat_infaq_created_idx on public.zakat_infaq (created_at desc);

alter table public.zakat_infaq enable row level security;

drop policy if exists zakat_infaq_select on public.zakat_infaq;
create policy zakat_infaq_select on public.zakat_infaq
  for select to authenticated
  using (
    (member_id = public.my_member_id() and public.my_member_id() is not null)
    or public.can_view_bantuan_admin()
  );

revoke all on public.zakat_infaq from anon, authenticated;
grant select on public.zakat_infaq to authenticated;

-- -----------------------------------------------------------------------------
-- Pembatalan bil pending oleh ahli — salinan tepat 20260916000046 + cabang zakat_infaq.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_pending_gateway_payment(p_table text, p_reference uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.my_member_id();
  v_updated   integer;
begin
  if v_member_id is null then
    raise exception 'Akaun anda tidak dibenarkan melakukan tindakan ini.' using errcode = 'MS001';
  end if;

  if p_reference is null then
    raise exception 'Rujukan bayaran tidak sah.' using errcode = '22023';
  end if;

  /* Nama table TIDAK pernah disambung ke dalam SQL — setiap cabang ialah pernyataan statik. */
  if p_table = 'yuran_payments' then
    update public.yuran_payments
    set status = 'failed', note = 'Dibatalkan oleh ahli'
    where gateway_reference = p_reference::text
      and method = 'gateway'
      and member_id = v_member_id
      and status = 'pending';
  elsif p_table = 'pipis_contributions' then
    update public.pipis_contributions
    set status = 'failed', note = 'Dibatalkan oleh ahli'
    where gateway_reference = p_reference::text
      and method = 'gateway'
      and member_id = v_member_id
      and status = 'pending';
  elsif p_table = 'zakat_infaq' then
    update public.zakat_infaq
    set status = 'failed', note = 'Dibatalkan oleh ahli'
    where gateway_reference = p_reference::text
      and method = 'gateway'
      and member_id = v_member_id
      and status = 'pending';
  else
    raise exception 'Jenis bayaran tidak sah.' using errcode = '22023';
  end if;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Bayaran ini tidak lagi boleh dibatalkan.' using errcode = 'MS001';
  end if;
end;
$$;

revoke all on function public.cancel_pending_gateway_payment(text, uuid) from public, anon;
grant execute on function public.cancel_pending_gateway_payment(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Admin TABUNG ZAKAT (can_view): semua rekod + ringkasan.
-- -----------------------------------------------------------------------------
create or replace function public.zakat_infaq_admin_list()
returns table (id uuid, created_at timestamptz, nombor_ahli text, full_name text, generasi text,
               amount numeric, requested_amount numeric, status text, note text, gateway_reference text)
language sql stable security definer set search_path = public
as $$
  select z.id, z.created_at, m.nombor_ahli::text, m.full_name, m.generasi,
         z.amount, z.requested_amount, z.status, z.note, z.gateway_reference
  from public.zakat_infaq z
  join public.members m on m.id = z.member_id
  where public.can_view_bantuan_admin()
  order by z.created_at desc, z.id;
$$;

create or replace function public.zakat_infaq_admin_summary()
returns table (jumlah numeric, bilangan integer, penderma integer, belum_selesai integer)
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(z.amount) filter (where z.status = 'success'), 0),
         (count(*) filter (where z.status = 'success'))::integer,
         (count(distinct z.member_id) filter (where z.status = 'success'))::integer,
         (count(*) filter (where z.status = 'pending'))::integer
  from public.zakat_infaq z
  where public.can_view_bantuan_admin();
$$;

revoke all on function public.zakat_infaq_admin_list() from public, anon;
revoke all on function public.zakat_infaq_admin_summary() from public, anon;
grant execute on function public.zakat_infaq_admin_list() to authenticated;
grant execute on function public.zakat_infaq_admin_summary() to authenticated;

notify pgrst, 'reload schema';
