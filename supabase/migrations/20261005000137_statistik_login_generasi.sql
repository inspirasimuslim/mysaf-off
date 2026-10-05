-- Statistik login + kelengkapan mengikut generasi (JABATAN DATA & SUMBER MANUSIA).
-- "Berjaya login" = akaun auth ahli mempunyai `last_sign_in_at` (semua ahli sudah
-- dipautkan kepada akaun, jadi `user_id` sahaja tidak membezakan). Ahli disekat tidak dikira.
-- Hanya fungsi baharu + eksport dilanjutkan; tiada data sedia ada diubah.

create or replace function public.member_login_generasi_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Statistik ini memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  with r as (
    select
      c.generasi,
      (u.last_sign_in_at is not null) as login,
      (c.data_peribadi::int + c.pendidikan::int + c.pekerjaan::int
       + c.perniagaan::int + c.keluarga::int + c.komitmen::int) as siap
    from public.member_completeness_rows() c
    join public.members m on m.id = c.member_id
    left join auth.users u on u.id = m.user_id
  )
  select jsonb_build_object(
    'jumlah_ahli', (select count(*) from r),
    'pernah_login', (select count(*) filter (where login) from r),
    'mengikut_generasi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'generasi', g.generasi,
        'jumlah', g.jumlah,
        'pernah_login', g.pernah_login,
        'siap_penuh', g.siap_penuh,
        'purata_peratus', g.purata
      ) order by g.generasi nulls last)
      from (
        select generasi,
               count(*) as jumlah,
               count(*) filter (where login) as pernah_login,
               count(*) filter (where siap = 6) as siap_penuh,
               round(avg(siap * 100.0 / 6))::int as purata
        from r group by generasi
      ) g
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke all on function public.member_login_generasi_stats() from public, anon;
grant execute on function public.member_login_generasi_stats() to authenticated;

-- Eksport per-ahli: tambah status login (OUT parameter berubah -> drop + create).
drop function if exists public.member_data_completeness_export();

create function public.member_data_completeness_export()
returns table (
  nombor_ahli   text,
  full_name     text,
  generasi      text,
  data_peribadi boolean,
  pendidikan    boolean,
  pekerjaan     boolean,
  perniagaan    boolean,
  keluarga      boolean,
  komitmen      boolean,
  jumlah_siap   int,
  peratus       int,
  updated_at    timestamptz,
  login_terakhir timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Eksport kelengkapan data memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  return query
  select
    r.nombor_ahli, r.full_name, r.generasi,
    r.data_peribadi, r.pendidikan, r.pekerjaan, r.perniagaan, r.keluarga, r.komitmen,
    (r.data_peribadi::int + r.pendidikan::int + r.pekerjaan::int
      + r.perniagaan::int + r.keluarga::int + r.komitmen::int),
    round((r.data_peribadi::int + r.pendidikan::int + r.pekerjaan::int
      + r.perniagaan::int + r.keluarga::int + r.komitmen::int) * 100.0 / 6)::int,
    r.updated_at,
    u.last_sign_in_at
  from public.member_completeness_rows() r
  join public.members m on m.id = r.member_id
  left join auth.users u on u.id = m.user_id
  order by r.nombor_ahli nulls last, r.full_name;
end;
$$;

revoke all on function public.member_data_completeness_export() from public, anon;
grant execute on function public.member_data_completeness_export() to authenticated;

notify pgrst, 'reload schema';
