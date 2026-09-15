-- =============================================================================
-- mysaf-off — Ahli yang sambut hari jadi bulan ini
--
-- Jalankan SELEPAS 20260913000021_birthday_today.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Bentuknya sama dengan `birthday_today()` dan atas sebab yang sama: tarikh
-- lahir diterbitkan daripada enam digit pertama NRIC, NRIC itu sendiri tidak
-- pernah keluar, dan tahun lahir tidak didedahkan. Yang berbeza hanyalah
-- tapisan — BULAN sahaja dibandingkan, bukan bulan dan hari — dan satu kolum
-- tambahan `tarikh_lahir` berbentuk '15 September' supaya senarai boleh dibaca
-- tanpa app perlu menerima nombor hari dan menamakan bulannya sendiri.
--
-- Susunan ikut HARI menaik, bukan generasi: senarai sebulan dibaca sebagai
-- kalendar ("siapa seterusnya"), bukan sebagai direktori.
-- =============================================================================

create or replace function public.birthday_this_month()
returns table (
  full_name    text,
  generasi     text,
  hari         int,
  tarikh_lahir text
)
language sql
stable
security definer
set search_path = public
as $$
  with hari_ini as (
    -- Waktu Malaysia, bukan UTC — sama seperti `birthday_today()`. Ia penting
    -- pada hari terakhir setiap bulan, di mana UTC masih berada di bulan lalu.
    select (now() at time zone 'Asia/Kuala_Lumpur')::date as tarikh
  ),
  nama_bulan as (
    select array[
      'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
      'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
    ] as label
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
        (29 Februari wujud dalam tahun lompat sahaja) dan tidak pernah keluar.
      */
      case
        when s.yy > (extract(year from h.tarikh)::int % 100) then 1900 + s.yy
        else 2000 + s.yy
      end as yyyy
    from sah s, hari_ini h
  )
  select
    l.full_name,
    l.generasi,
    l.dd as hari,
    l.dd::text || ' ' || b.label[l.mm] as tarikh_lahir
  from lahir l, hari_ini h, nama_bulan b
  where l.mm between 1 and 12
    -- CASE menjamin `make_date` hanya dipanggil bila bulan sah; hari yang
    -- melebihi bilangan hari bulan itu (contoh 31 April) ditolak.
    and case
          when l.mm between 1 and 12 then
            l.dd between 1 and extract(day from (make_date(l.yyyy, l.mm, 1) + interval '1 month' - interval '1 day'))::int
          else false
        end
    and l.mm = extract(month from h.tarikh)::int
    and public.can_read_shared()
  order by
    l.dd,
    coalesce(nullif(regexp_replace(coalesce(l.generasi, ''), '\D', '', 'g'), '')::int, 9999),
    l.full_name;
$$;

revoke all on function public.birthday_this_month() from public, anon;
grant execute on function public.birthday_this_month() to authenticated;

notify pgrst, 'reload schema';
