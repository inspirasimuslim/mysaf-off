-- Tamrin dan markah ujian: Lajnah Perkaderan sahaja (naqib tidak lagi).
CREATE OR REPLACE FUNCTION public.perkaderan_tamrin_roster(p_tamrin uuid)
 RETURNS TABLE(mad_u_id uuid, nama text, tingkatan text, sekolah text, group_name text, hadir boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prog uuid;
  v_admin boolean := public.is_super_admin() or public.can_view_perkaderan();
begin
  select t.program_id into v_prog from public.perkaderan_tamrin t where t.id = p_tamrin;
  if v_prog is null then return; end if;
  if not v_admin then
    raise exception 'Tiada kebenaran.' using errcode = '42501';
  end if;
  return query
  select m.id, m.nama, m.tingkatan, g.sekolah, g.group_name,
         exists (select 1 from public.perkaderan_tamrin_attendance ta where ta.tamrin_id = p_tamrin and ta.mad_u_id = m.id)
    from public.sekolah_usrah_mad_u m
    join public.sekolah_usrah_groups g on g.id = m.group_id
   where m.is_active and g.is_active and g.program_id is not distinct from v_prog
     
   order by g.sekolah, g.group_name, m.nama;
end $function$
;

CREATE OR REPLACE FUNCTION public.perkaderan_tamrin_set(p_tamrin uuid, p_semua uuid[], p_hadir uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin boolean := public.is_super_admin() or public.can_edit_perkaderan();
  v_id uuid;
begin
  if not exists (select 1 from public.perkaderan_tamrin where id = p_tamrin) then
    raise exception 'Tamrin tidak dijumpai.';
  end if;
  foreach v_id in array coalesce(p_semua, '{}') loop
    if not v_admin then
      raise exception 'Tiada kebenaran mengemas kini kehadiran mad''u ini.' using errcode = '42501';
    end if;
    if v_id = any (coalesce(p_hadir, '{}')) then
      insert into public.perkaderan_tamrin_attendance (tamrin_id, mad_u_id) values (p_tamrin, v_id) on conflict do nothing;
    else
      delete from public.perkaderan_tamrin_attendance where tamrin_id = p_tamrin and mad_u_id = v_id;
    end if;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.perkaderan_ujian_roster(p_ujian uuid)
 RETURNS TABLE(mad_u_id uuid, nama text, tingkatan text, sekolah text, group_name text, markah numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_prog uuid; v_admin boolean := public.is_super_admin() or public.can_view_perkaderan();
begin
  select u.program_id into v_prog from public.perkaderan_ujian u where u.id = p_ujian;
  if v_prog is null then return; end if;
  if not v_admin then raise exception 'Tiada kebenaran.' using errcode='42501'; end if;
  return query
  select m.id, m.nama, m.tingkatan, g.sekolah, g.group_name,
         (select k.markah from public.perkaderan_ujian_markah k where k.ujian_id = p_ujian and k.mad_u_id = m.id)
    from public.sekolah_usrah_mad_u m
    join public.sekolah_usrah_groups g on g.id = m.group_id
   where m.is_active and g.is_active and g.program_id is not distinct from v_prog
     
   order by g.sekolah, g.group_name, m.nama;
end $function$
;

CREATE OR REPLACE FUNCTION public.perkaderan_ujian_set(p_ujian uuid, p_ids uuid[], p_markah numeric[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_admin boolean := public.is_super_admin() or public.can_edit_perkaderan(); v_penuh numeric; i int;
begin
  select markah_penuh into v_penuh from public.perkaderan_ujian where id = p_ujian;
  if v_penuh is null then raise exception 'Ujian tidak dijumpai.'; end if;
  if coalesce(array_length(p_ids,1),0) <> coalesce(array_length(p_markah,1),0) then raise exception 'Data tidak sepadan.'; end if;
  for i in 1 .. coalesce(array_length(p_ids,1),0) loop
    if not v_admin then
      raise exception 'Tiada kebenaran memasukkan markah mad''u ini.' using errcode='42501';
    end if;
    if p_markah[i] is null then
      delete from public.perkaderan_ujian_markah where ujian_id = p_ujian and mad_u_id = p_ids[i];
    else
      if p_markah[i] < 0 or p_markah[i] > v_penuh then raise exception 'Markah mesti antara 0 dan %.', v_penuh; end if;
      insert into public.perkaderan_ujian_markah(ujian_id, mad_u_id, markah) values (p_ujian, p_ids[i], p_markah[i])
        on conflict (ujian_id, mad_u_id) do update set markah = excluded.markah;
    end if;
  end loop;
end $function$
;
