-- mysaf-off -- Pembetulan Rais/Raisah (2026-10-05, selepas migration 133)
--
-- 1. Kuasa lantik dipecah ikut jenis:
--      generasi -> department JABATAN SETIAUSAHA (admin > Setiausaha)
--      kawasan  -> department LAJNAH TARBIAH     (admin > Tarbiah)
--    Super Admin dirangkumi oleh has_department_access().
-- 2. Generasi i19 hanya ada Raisah: slot Rais i19 dibuang (Raisah i19 kekal).

delete from public.rais_lantikan
 where jenis = 'generasi' and kod = 'i19' and peranan = 'rais';

drop function if exists public.can_edit_rais_lantikan(uuid);

create or replace function public.can_edit_rais_lantikan(p_jenis text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_jenis
    when 'generasi' then public.has_department_access('JABATAN SETIAUSAHA', true)
    when 'kawasan'  then public.has_department_access('LAJNAH TARBIAH', true)
    else public.has_department_access('JABATAN SETIAUSAHA', true)
      or public.has_department_access('LAJNAH TARBIAH', true)
  end;
$$;
revoke all on function public.can_edit_rais_lantikan(text) from public, anon;
grant execute on function public.can_edit_rais_lantikan(text) to authenticated;

-- Pilihan ahli: sesiapa yang boleh mengedit sekurang-kurangnya satu jenis.
create or replace function public.rais_member_options()
returns table (
  id            uuid,
  full_name     text,
  generasi      text,
  avatar_url    text,
  jantina       text,
  kawasan_usrah text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.full_name, m.generasi, m.avatar_url, m.jantina, m.kawasan_usrah
  from public.members m
  where public.can_edit_rais_lantikan(null) and not m.disekat
  order by m.full_name;
$$;
revoke all on function public.rais_member_options() from public, anon;
grant execute on function public.rais_member_options() to authenticated;

create or replace function public.set_rais_lantikan(p_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peranan text;
  v_jenis   text;
  v_jantina text;
begin
  select peranan, jenis into v_peranan, v_jenis from public.rais_lantikan where id = p_id;
  if v_peranan is null then
    raise exception 'Slot lantikan tidak dijumpai.';
  end if;

  if not public.can_edit_rais_lantikan(v_jenis) then
    raise exception 'Tiada kebenaran mengubah lantikan Rais/Raisah.' using errcode = '42501';
  end if;

  if p_member_id is not null then
    select jantina into v_jantina from public.members where id = p_member_id and not disekat;
    if v_jantina is null then
      raise exception 'Ahli tidak dijumpai.';
    end if;
    if v_peranan = 'rais' and v_jantina <> 'Muslimin' then
      raise exception 'Rais mesti seorang Muslimin.';
    end if;
    if v_peranan = 'raisah' and v_jantina <> 'Muslimat' then
      raise exception 'Raisah mesti seorang Muslimat.';
    end if;
  end if;

  update public.rais_lantikan set member_id = p_member_id, updated_at = now() where id = p_id;
end;
$$;
revoke all on function public.set_rais_lantikan(uuid, uuid) from public, anon;
grant execute on function public.set_rais_lantikan(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
