-- Padam kaunselor (aktif atau tidak aktif) oleh admin LAJNAH KEBAJIKAN. KEKAL: perbualan, mesej dan catatan hubungan
-- kaunselor itu turut dipadam (on delete cascade). Memulangkan gambar_path supaya klien boleh membuang objek gambar.
create or replace function public.counseling_delete(p_counselor uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_path text;
begin
  if not public.has_department_access('LAJNAH KEBAJIKAN', true) then
    raise exception 'Anda tidak boleh memadam kaunselor.' using errcode = '42501';
  end if;
  delete from public.counselors where id = p_counselor returning gambar_path into v_path;
  if not found then
    raise exception 'Kaunselor tidak ditemui.' using errcode = 'P0002';
  end if;
  return v_path;
end;
$$;
revoke all on function public.counseling_delete(uuid) from public, anon;
grant execute on function public.counseling_delete(uuid) to authenticated;
notify pgrst, 'reload schema';
