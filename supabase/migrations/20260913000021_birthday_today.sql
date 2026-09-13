-- =============================================================================
-- mysaf-off — Ahli yang lahir hari ini
--
-- Jalankan SELEPAS 20260913000020_member_statistics.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Tarikh lahir tidak disimpan sebagai kolum; ia diterbitkan daripada enam digit
-- pertama NRIC (YYMMDD). Fungsi ini membaca NRIC tetapi TIDAK memulangkannya —
-- yang keluar hanyalah nama penuh dan kod generasi ahli yang bulan dan harinya
-- sama dengan hari ini. Tahun lahir, dan dengan itu umur, tidak didedahkan.
-- =============================================================================

create or replace function public.birthday_today()
returns table (
  full_name text,
  generasi  text
)
language sql
stable
security definer
set search_path = public
as $$
  with hari as (
    -- "Hari ini" mengikut waktu Malaysia, bukan UTC: tanpa ini, ahli yang lahir
    -- esok muncul seawal jam 4 petang sebelumnya.
    select (now() at time zone 'Asia/Kuala_Lumpur')::date as tarikh
  ),
  calon as (
    select
      m.full_name,
      m.generasi,
      -- Sengkang dan ruang dibuang dahulu: '900101-01-1234' dan '900101011234'
      -- ialah NRIC yang sama.
      regexp_replace(coalesce(m.nric, ''), '\D', '', 'g') as digit
    from public.members m
    where not m.disekat
  ),
  sah as (
    select
      c.full_name,
      c.generasi,
      substr(c.digit, 1, 2)::int as yy,
      substr(c.digit, 3, 2)::int as mm,
      substr(c.digit, 5, 2)::int as dd
    from calon c
    -- NRIC kosong, bukan 12 digit, atau format asing dilangkau senyap.
    where c.digit ~ '^\d{12}$'
  ),
  lahir as (
    select
      s.full_name,
      s.generasi,
      s.mm,
      s.dd,
      /*
        Abad: YY lebih besar daripada dua digit tahun semasa → 19YY, selain
        itu → 20YY. Tahun penuh diperlukan hanya untuk mengesahkan tarikh
        (29 Februari wujud dalam tahun lompat sahaja).
      */
      case
        when s.yy > (extract(year from h.tarikh)::int % 100) then 1900 + s.yy
        else 2000 + s.yy
      end as yyyy
    from sah s, hari h
  )
  select l.full_name, l.generasi
  from lahir l, hari h
  where l.mm between 1 and 12
    -- CASE menjamin `make_date` hanya dipanggil bila bulan sah; hari yang
    -- melebihi bilangan hari bulan itu (contoh 31 April) ditolak.
    and case
          when l.mm between 1 and 12 then
            l.dd between 1 and extract(day from (make_date(l.yyyy, l.mm, 1) + interval '1 month' - interval '1 day'))::int
          else false
        end
    and l.mm = extract(month from h.tarikh)::int
    and l.dd = extract(day from h.tarikh)::int
    and public.can_read_shared()
  order by
    coalesce(nullif(regexp_replace(coalesce(l.generasi, ''), '\D', '', 'g'), '')::int, 9999),
    l.full_name;
$$;

revoke all on function public.birthday_today() from public, anon;
grant execute on function public.birthday_today() to authenticated;

notify pgrst, 'reload schema';
