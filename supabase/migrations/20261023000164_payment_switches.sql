-- =============================================================================
-- mysaf-off — Suis pelayan untuk bayaran online (ToyyibPay): matikan tanpa kemas kini APK
--
-- `payment_switches` (satu baris setiap jenis: pipis / yuran / zakat). Pencetus BEFORE INSERT pada
-- tiga table bayaran menolak baris `method = 'gateway'` bila suis `enabled = false`, jadi bil baharu
-- tidak boleh dicipta walau APK lama masih memanggil Edge Function. TIDAK menjejaskan:
--   • rekod manual admin (method <> 'gateway' — tunai/pindahan),
--   • bil yang sudah pending/dibayar — `toyyibpay-callback` hanya UPDATE, jadi bayaran yang sudah
--     dibuat sebelum dimatikan tetap disahkan dan direkod.
-- Table terkunci (RLS tanpa polisi, tiada GRANT): hanya service role / SQL. Baris tiada = dibenarkan.
-- Edge Function (selepas deploy) memetakan mesej `PAYMENT_DISABLED:` kepada mesej ramah; sebelum itu
-- ahli nampak "Gagal merekod bil bayaran." Idempotent.
-- =============================================================================

create table if not exists public.payment_switches (
  kind        text primary key check (kind in ('pipis', 'yuran', 'zakat')),
  enabled     boolean not null default true,
  message     text,
  updated_at  timestamptz not null default now()
);

alter table public.payment_switches enable row level security;
revoke all on public.payment_switches from anon, authenticated;

insert into public.payment_switches (kind) values ('pipis'), ('yuran'), ('zakat')
on conflict (kind) do nothing;

create or replace function public.guard_gateway_payment_switch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_message text;
begin
  if new.method is distinct from 'gateway' then
    return new;
  end if;

  select enabled, message into v_enabled, v_message
  from public.payment_switches where kind = tg_argv[0];

  if found and v_enabled = false then
    raise exception 'PAYMENT_DISABLED:%',
      coalesce(nullif(btrim(v_message), ''), 'Bayaran online ditutup buat sementara waktu. Sila cuba lagi kemudian.')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_gateway_payment_switch() from public, anon, authenticated;

drop trigger if exists yuran_payments_payment_switch on public.yuran_payments;
create trigger yuran_payments_payment_switch before insert on public.yuran_payments
  for each row execute function public.guard_gateway_payment_switch('yuran');

drop trigger if exists pipis_contributions_payment_switch on public.pipis_contributions;
create trigger pipis_contributions_payment_switch before insert on public.pipis_contributions
  for each row execute function public.guard_gateway_payment_switch('pipis');

drop trigger if exists zakat_infaq_payment_switch on public.zakat_infaq;
create trigger zakat_infaq_payment_switch before insert on public.zakat_infaq
  for each row execute function public.guard_gateway_payment_switch('zakat');
