-- Ranking kelayakan Tamrin 3K (Pra-Keahlian): 1 item = 1 mata (setiap usrah dihadiri + TAQ + TAMPENOR + QTC).
-- Usrah = baseline import (grid KEHADIRAN USRAH 2026, tiada senarai sesi per orang) + baris kehadiran sebenar
-- sesi yang direkod naqib (sesi import Google Form tidak dikira lagi — sudah diwakili baseline).
alter table public.sekolah_usrah_mad_u
  add column if not exists usrah_import_hadir int not null default 0,
  add column if not exists usrah_import_jumlah int not null default 0;

create or replace function public.perkaderan_ranking_3k(p_tingkatan text default null)
returns table (
  mad_u_id uuid, nama text, sekolah text, no_kumpulan int, tingkatan text,
  usrah_hadir int, usrah_jumlah int, taq boolean, tampenor boolean, qtc boolean, mata int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Tiada kebenaran' using errcode = '42501';
  end if;
  return query
  with base as (
    select m.id, m.nama, g.sekolah, g.no_kumpulan, coalesce(m.tingkatan, g.tingkatan) as tkt,
      m.usrah_import_hadir
        + (select count(*) from public.sekolah_usrah_attendance a
             join public.sekolah_usrah_sessions s on s.id = a.session_id
            where a.mad_u_id = m.id and s.sumber is distinct from 'import_google_form')::int as hadir,
      m.usrah_import_jumlah
        + (select count(*) from public.sekolah_usrah_sessions s
            where s.group_id = m.group_id and s.sumber is distinct from 'import_google_form'
              and s.session_date >= (m.added_at at time zone 'Asia/Kuala_Lumpur')::date)::int as jumlah,
      public.perkaderan_ada_tamrin(m.id, 'taq') as taq,
      public.perkaderan_ada_tamrin(m.id, 'tampenor') as tampenor,
      public.perkaderan_ada_tamrin(m.id, 'qtc') as qtc
    from public.sekolah_usrah_mad_u m
    join public.sekolah_usrah_groups g on g.id = m.group_id
    where m.is_active and g.is_active
      and (p_tingkatan is null or coalesce(m.tingkatan, g.tingkatan) = p_tingkatan)
  )
  select b.id, b.nama, b.sekolah, b.no_kumpulan, b.tkt, b.hadir, b.jumlah, b.taq, b.tampenor, b.qtc,
         b.hadir + b.taq::int + b.tampenor::int + b.qtc::int
  from base b
  order by 11 desc, b.nama;
end $$;

create or replace function public.perkaderan_ada_tamrin(p_mad_u uuid, p_jenis text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perkaderan_tamrin_attendance ta
    join public.perkaderan_tamrin t on t.id = ta.tamrin_id
    where ta.mad_u_id = p_mad_u and t.jenis = p_jenis);
$$;
revoke all on function public.perkaderan_ada_tamrin(uuid, text) from public, anon, authenticated;
grant execute on function public.perkaderan_ranking_3k(text) to authenticated;
