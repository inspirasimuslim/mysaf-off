-- =============================================================================
-- mysaf-off — "Pencapaian Akademik Tertinggi" (dulu Pemegang PhD): tambah peringkat
--
-- Skrin kini dua bahagian: PhD (atas) dan Sarjana (bawah). Table `phd_graduates` dikekalkan
-- (nama, RLS, bucket `phd-gallery` dan polisi tidak berubah) — hanya lajur `peringkat` ditambah.
-- Baris sedia ada (bukan data sebenar: table kosong semasa ini) menjadi 'phd' melalui lalai.
-- `tajuk_tesis` kini dipaparkan sebagai "Tajuk penyelidikan". Idempotent.
-- =============================================================================

alter table public.phd_graduates
  add column if not exists peringkat text not null default 'phd';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.phd_graduates'::regclass and conname = 'phd_graduates_peringkat_check'
  ) then
    alter table public.phd_graduates
      add constraint phd_graduates_peringkat_check check (peringkat in ('phd', 'sarjana'));
  end if;
end $$;

create index if not exists phd_graduates_peringkat_idx
  on public.phd_graduates (peringkat, tahun_tamat desc nulls last, nama);
