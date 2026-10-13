-- =============================================================================
-- mysaf-off — Akses data Kesihatan ahli diasingkan ke department KHUSUS — 2026-10-13
--
-- Sebelum ini (migration 085/095) admin LAJNAH KEBAJIKAN (admin umum yang mengurus
-- data ahli) boleh melihat/menyunting data kesihatan dan mengeksportnya. Kini akses
-- itu hanya untuk department 'KESIHATAN AHLI' (dicipta di sini) + pemilik sendiri +
-- Super Admin (dirangkumi oleh has_department_access). Admin LAJNAH KEBAJIKAN
-- TIDAK lagi mendapat akses kecuali ditugaskan juga ke KESIHATAN AHLI.
-- Hanya fungsi/department berubah; tiada data/kolum disentuh -> tiada snapshot.
-- Polisi RLS pada member_health_issues memanggil can_view_health()/can_edit_health()
-- jadi mengikut perubahan ini secara automatik. get_rais_lajnah_kebajikan() (paparan
-- kenalan sahaja) tidak berubah.
-- =============================================================================

insert into public.departments (name, is_active)
values ('KESIHATAN AHLI', true)
on conflict (name) do nothing;

create or replace function public.can_view_health(p_member_id uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_department_access('KESIHATAN AHLI', false, uid)
      or exists (
        select 1 from public.members m
        where m.id = p_member_id and m.user_id = uid and uid is not null
      );
$$;

create or replace function public.can_edit_health(p_member_id uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_department_access('KESIHATAN AHLI', true, uid)
      or exists (
        select 1 from public.members m
        where m.id = p_member_id and m.user_id = uid and uid is not null
      );
$$;

create or replace function public.members_export_kesihatan()
returns table (
  nombor_ahli            text,
  full_name              text,
  generasi               text,
  jenis_masalah          text,
  nama_penyakit          text,
  ada_temujanji_hospital boolean,
  keterangan_lain        text
)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not coalesce(public.has_department_access('KESIHATAN AHLI', false), false) then
    raise exception 'Eksport data kesihatan hanya untuk admin KESIHATAN AHLI dan Super Admin.'
      using errcode = 'MS001';
  end if;

  return query
  select m.nombor_ahli, m.full_name, m.generasi,
         h.jenis_masalah, h.nama_penyakit, h.ada_temujanji_hospital, h.keterangan_lain
  from public.member_health_issues h
  join public.members m on m.id = h.member_id
  order by m.nombor_ahli nulls last, m.full_name, h.created_at;
end;
$$;

revoke all on function public.can_view_health(uuid, uuid) from public, anon;
revoke all on function public.can_edit_health(uuid, uuid) from public, anon;
revoke all on function public.members_export_kesihatan() from public, anon;
grant execute on function public.can_view_health(uuid, uuid) to authenticated;
grant execute on function public.can_edit_health(uuid, uuid) to authenticated;
grant execute on function public.members_export_kesihatan() to authenticated;

notify pgrst, 'reload schema';
