-- =============================================================================
-- mysaf-off — Ahli membatalkan bayaran online yang masih pending
--
-- Jalankan SELEPAS 20260916000045_yuran_toyyibpay.sql. Idempotent.
--
-- Bil ToyyibPay yang ditutup tanpa dibayar kekal 'pending' sehingga tamat
-- tempoh, dan banner "sedang diproses" mengikut ahli ke mana-mana. Fungsi ini
-- membenarkan ahli menandanya 'failed' sendiri.
--
-- Pembatalan ini KEMUDAHAN PAPARAN, bukan keputusan kewangan. Jika bil yang
-- dibatalkan akhirnya dibayar juga (pautan lama masih terbuka), toyyibpay-callback
-- tetap menukar 'failed' kepada 'success' selepas ToyyibPay mengesahkannya —
-- data ToyyibPay ialah punca kebenaran terakhir.
-- =============================================================================

create or replace function public.cancel_pending_gateway_payment(p_table text, p_reference uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  /*
    `my_member_id()` sudah NULL untuk akaun disekat atau yang masih memegang
    kata laluan sementara — kunci yang sama seperti setiap policy "baris sendiri".
  */
  v_member_id uuid := public.my_member_id();
  v_updated   integer;
begin
  if v_member_id is null then
    raise exception 'Akaun anda tidak dibenarkan melakukan tindakan ini.' using errcode = 'MS001';
  end if;

  if p_reference is null then
    raise exception 'Rujukan bayaran tidak sah.' using errcode = '22023';
  end if;

  /*
    Nama table TIDAK pernah disambung ke dalam SQL. Setiap cabang ialah
    pernyataan statik, jadi nilai p_table selain dua ini tidak boleh menyentuh
    apa-apa table lain.
  */
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
  else
    raise exception 'Jenis bayaran tidak sah.' using errcode = '22023';
  end if;

  get diagnostics v_updated = row_count;

  /*
    Satu mesej untuk "bukan milik anda", "tidak wujud" dan "sudah selesai":
    membezakannya hanya memberitahu pemanggil rujukan milik orang lain wujud.
  */
  if v_updated = 0 then
    raise exception 'Bayaran ini tidak lagi boleh dibatalkan.' using errcode = 'MS001';
  end if;
end;
$$;

revoke all on function public.cancel_pending_gateway_payment(text, uuid) from public, anon;
grant execute on function public.cancel_pending_gateway_payment(text, uuid) to authenticated;

notify pgrst, 'reload schema';
