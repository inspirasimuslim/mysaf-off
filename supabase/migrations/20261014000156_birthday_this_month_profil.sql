-- =============================================================================
-- mysaf-off — birthday_this_month(): tambah nombor_ahli + hari_ini
--
-- Skrin Hari Jadi Bulan kini (a) menyerlahkan dan menyenaraikan dahulu mereka yang
-- sambut HARI INI dan (b) membolehkan ketik nama -> profil ahli. Untuk itu:
--   * nombor_ahli : kunci padanan ke direktori (id dalaman tidak didedahkan).
--   * hari_ini    : dikira dalam waktu Malaysia di pangkalan data (bukan jam peranti).
-- Logik tapisan/susunan SAMA seperti 038. Tiada data baharu didedahkan (nombor ahli
-- sudah ada dalam list_members_directory()). Bentuk output berubah -> drop + create.
-- Klien lama mengabaikan dua kolum tambahan. Idempotent.
-- =============================================================================

drop function if exists public.birthday_this_month();

create or replace function public.birthday_this_month()
returns table (
  full_name    text,
  generasi     text,
  hari         int,
  tarikh_lahir text,
  nombor_ahli  text,
  hari_ini     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with sekarang as (
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
      m.nombor_ahli,
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
      c.nombor_ahli,
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
      s.nombor_ahli,
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
    from sah s, sekarang h
  )
  select
    l.full_name,
    l.generasi,
    l.dd as hari,
    l.dd::text || ' ' || b.label[l.mm] as tarikh_lahir,
    l.nombor_ahli,
    (l.dd = extract(day from h.tarikh)::int) as hari_ini
  from lahir l, sekarang h, nama_bulan b
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
