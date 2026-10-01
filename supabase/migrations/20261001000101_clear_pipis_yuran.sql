-- =============================================================================
-- mysaf-off — Padam SEMUA rekod transaksi Pipis & Yuran (mula semula)
--
-- Jalankan SELEPAS 20261001000100_clear_pipis_yuran_backup.sql (snapshot dalam
-- schema backup_20261001_clear_pipis_yuran).
--
-- Dipadam PENUH: yuran_payments, yuran_group_payments, pipis_contributions,
-- yuran_ledger (termasuk baki permulaan 2025 DAN caj 2026/2027 — Bendahari
-- menjana semula tahun 2026 dan 2027 melalui generate_yuran_year()).
-- Dikekalkan: members, adhoc_payment_types, admin_activity_log, semua fungsi
-- dan tetapan (sasaran PIPIS dsb.). Tiada baki disimpan sebagai kolum — baki
-- dikira daripada table di atas, jadi ia menjadi 0 dengan sendirinya.
--
-- Pagar keselamatan: setiap baris hidup MESTI wujud dalam snapshot. Jika ada
-- baris baharu selepas snapshot (cth bayaran masuk antara dua migration),
-- migration digugurkan dan tiada apa dipadam — jalankan semula snapshot dahulu.
-- =============================================================================

do $$
declare
  t text;
  extra bigint;
  gone bigint;
begin
  foreach t in array array['yuran_payments', 'yuran_group_payments', 'pipis_contributions', 'yuran_ledger'] loop
    execute format(
      'select count(*) from (select * from public.%I except select * from backup_20261001_clear_pipis_yuran.%I) x',
      t, t || '_pre_clear'
    ) into extra;
    if extra > 0 then
      raise exception 'Table % ada % baris yang tiada dalam snapshot — pembersihan dibatalkan.', t, extra;
    end if;
  end loop;

  -- Turutan FK: yuran_payments.group_payment_id -> yuran_group_payments.
  foreach t in array array['yuran_payments', 'yuran_group_payments', 'pipis_contributions', 'yuran_ledger'] loop
    execute format('delete from public.%I', t);
    get diagnostics gone = row_count;
    raise notice 'dipadam % : % baris', t, gone;
  end loop;
end $$;
