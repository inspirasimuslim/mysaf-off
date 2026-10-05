-- Susulan kepada 20261005000126_import_ahli_diputihkan.sql.
--
-- 16 baris yang digugurkan sebelum ini (tiada TAHUN DIPECAT dalam fail
-- sumber) kini diimport dengan tahun_dibuang = 2026, atas arahan eksplisit
-- pemilik sistem (apizsekeru, 2026-10-05): "Kau masukkan juga senarai yang
-- tidak ada tahun. Set tahun mereka 2026."

do $$
declare v_before int;
begin
  select count(*) into v_before from public.ahli_diputihkan;
  if v_before <> 77 then
    raise exception 'Jangkaan 77 baris sedia ada (daripada migration 126), dapat %', v_before;
  end if;
end $$;

insert into public.ahli_diputihkan (nama, generasi, tahun_dibuang)
values
  ('Ahmad Fidar Rosli', 'i06', 2026),
  ('MOHD FAKHRUL RADZI B. MOHD MAWARDZI', 'i06', 2026),
  ('ALIATUL AKHMA BT. HAMID', 'i09', 2026),
  ('NURUL IZZATI BT MOHAMED NAWI', 'i14', 2026),
  ('HANNAN AMALINA BT CHE YUSUFF ZAKI', 'i16', 2026),
  ('NUR SHAMIN SHAIRA BT MOHD SUKRI', 'i17', 2026),
  ('MOHD NUR FATIHIN B MD ASRI', 'i18', 2026),
  ('NIK NORASMIDA BT. NIK MOHAMAD AZIZI', 'i19', 2026),
  ('NUR EMILIA SYAHIRAH BT AZNAN', 'i20', 2026),
  ('NURUL IZZAH BT ABDUL RAHIM', 'i20', 2026),
  ('SITI SARAH BT BT RADZUAN', 'i20', 2026),
  ('WAN MUHAMMAD ZIKRY BIN WAN ZAYUHISHAM', 'i22', 2026),
  ('NORAIRIN SYARIZA BT MOHD PAUZI', 'i23', 2026),
  ('NURUL AINI BT MAT LAZIM', 'i23', 2026),
  ('MUHAMMAD AIZAT BIN MOHD NURUDIN', 'i23', 2026),
  ('ABDUL ZUHIER BIN SAUFI', 'i24', 2026);

notify pgrst, 'reload schema';
