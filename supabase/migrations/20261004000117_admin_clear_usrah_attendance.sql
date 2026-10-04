-- =============================================================================
-- mysaf-off — Kosongkan status kehadiran usrah (fall back ke "belum ditanda")
--
-- Diminta 2026-10-04: Ahli > Betulkan Kehadiran Usrah. `admin_set_usrah_
-- attendance()` sedia ada hanya boleh menulis Hadir/Tidak Hadir
-- (p_attended not null, disahkan wajib) — tiada jalan untuk padam baris dan
-- kembali ke keadaan "tiada rekod" (attended IS NULL / baris tiada terus).
--
-- RPC baharu memadam terus baris `usrah_monthly_attendance` bagi
-- member/tahun/bulan tersebut (bukan UPDATE attended=null — baris kosong
-- dan baris tiada terus bermaksud SAMA kepada setiap pembaca sedia ada,
-- lihat `fetchUsrahYearRecords()`/`fetchUsrahYear()`), supaya bulan itu
-- fallback seolah-olah ahli belum tanda kehadiran — sumber (QR/program
-- ganti) turut terhapus sekali, bukan sekadar status hadir/tidak.
-- =============================================================================

create or replace function public.admin_clear_usrah_attendance(
  p_member_id uuid,
  p_year      int,
  p_month     int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text;
  v_existed boolean;
begin
  if not coalesce(public.can_edit_usrah(), false) then
    raise exception 'Membetulkan kehadiran usrah memerlukan kebenaran menyunting pada LAJNAH TARBIAH.'
      using errcode = 'MS001';
  end if;

  if p_year is null or p_year < 2000 or p_year > 2100 or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Tahun atau bulan tidak sah.' using errcode = '22023';
  end if;

  select full_name into v_name from public.members where id = p_member_id;
  if not found then
    raise exception 'Ahli tidak dijumpai.' using errcode = 'P0002';
  end if;

  delete from public.usrah_monthly_attendance
   where member_id = p_member_id and year = p_year and month = p_month;
  v_existed := found;

  if v_existed then
    perform public.log_admin_activity(
      'Kosongkan status kehadiran usrah',
      'usrah_monthly_attendance',
      p_member_id::text,
      jsonb_build_object(
        'label', coalesce(v_name, 'Ahli') || ' · ' || lpad(p_month::text, 2, '0') || '/' || p_year
      ),
      auth.uid()
    );
  end if;
end;
$$;

revoke all on function public.admin_clear_usrah_attendance(uuid, int, int) from public, anon;
grant execute on function public.admin_clear_usrah_attendance(uuid, int, int) to authenticated;

notify pgrst, 'reload schema';
