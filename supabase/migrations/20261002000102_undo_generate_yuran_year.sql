-- =============================================================================
-- mysaf-off — Batal jana yuran tahunan (undo)
--
-- `generate_yuran_year()` (20260907000014) HANYA INSERT, dengan
-- `on conflict (member_id, year) do nothing` — ia tidak pernah menimpa baris
-- sedia ada. Itu bermakna "undo" boleh dibuat SELAMAT: padam semula baris
-- `yuran_ledger` tahun berkenaan, tetapi HANYA yang tiada sebarang bayaran
-- (`yuran_payments`) direkod untuk ahli+tahun itu. Baris yang sudah ada
-- bayaran (gateway, manual, dsb.) TIDAK disentuh — memadamnya akan
-- mengghaibkan wang yang betul-betul masuk, jadi ia dikekalkan dan dikira
-- berasingan supaya admin tahu berapa yang tidak boleh dibatalkan sepenuhnya.
--
-- Tahun baki permulaan (2025 dan sebelumnya) tidak boleh dibatalkan melalui
-- fungsi ini — ia bukan hasil `generate_yuran_year()`.
-- =============================================================================

create or replace function public.undo_generate_yuran_year(p_year int)
returns table (dipadam int, dikekalkan int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dipadam int;
  v_dikekalkan int;
begin
  if not public.can_edit_yuran() then
    raise exception 'Membatalkan penjanaan yuran memerlukan kebenaran menyunting pada department BENDAHARI.'
      using errcode = 'MS001';
  end if;

  if p_year < 2026 then
    raise exception 'Tahun % ialah baki permulaan atau tidak sah — tidak boleh dibatalkan melalui fungsi ini.', p_year
      using errcode = 'MS003';
  end if;

  if p_year > 2100 then
    raise exception 'Tahun tidak sah.' using errcode = 'MS003';
  end if;

  select count(*) into v_dikekalkan
  from public.yuran_ledger l
  where l.year = p_year
    and l.is_opening_balance = false
    and exists (
      select 1 from public.yuran_payments p
      where p.member_id = l.member_id and p.year = p_year
    );

  delete from public.yuran_ledger l
  where l.year = p_year
    and l.is_opening_balance = false
    and not exists (
      select 1 from public.yuran_payments p
      where p.member_id = l.member_id and p.year = p_year
    );

  get diagnostics v_dipadam = row_count;

  return query select v_dipadam, v_dikekalkan;
end;
$$;

revoke all on function public.undo_generate_yuran_year(int) from public, anon;
grant execute on function public.undo_generate_yuran_year(int) to authenticated;
