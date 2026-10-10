-- Notifikasi admin (loceng di kepala skrin) — 2026-10-10.
--
-- Sengaja DITERBITKAN (derived), bukan table notifikasi berasingan: setiap baris
-- dikira terus daripada tugasan yang benar-benar tertunggak (iklan menunggu semakan,
-- permintaan padam akaun menunggu). Akibatnya penanda merah hilang sendiri sebaik
-- admin meluluskan/menolak — tiada status "dibaca" yang boleh tersasar daripada
-- keadaan sebenar, dan tiada trigger pada table lain.
--
-- Setiap sumber disekat oleh fungsi kebenaran SEDIA ADA yang sama dengan skrin
-- semakannya, jadi admin hanya diberitahu tentang apa yang boleh dibukanya.
-- Admin baharu (Tarbiah, Kebajikan dll.) ditambah dengan satu blok `union all`.

create or replace function public.admin_notifications()
returns table (
  kind    text,
  title   text,
  preview text,
  jumlah  integer,
  terbaru timestamptz,
  route   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jumlah  integer;
  v_nama    text;
  v_bisnes  text;
  v_terbaru timestamptz;
begin
  -- 1. Iklan perniagaan menunggu semakan — LAJNAH EKONOMI DAN ASET (+ Super Admin).
  if public.can_view_business_ads_admin() then
    select count(*) into v_jumlah
    from public.member_business_ads a
    where a.status = 'menunggu';

    if v_jumlah > 0 then
      -- Yang paling BARU dihantar dijadikan pratonton (itu yang admin belum nampak).
      select m.full_name, a.nama_bisnes, a.submitted_at
        into v_nama, v_bisnes, v_terbaru
      from public.member_business_ads a
      join public.members m on m.id = a.member_id
      where a.status = 'menunggu'
      order by a.submitted_at desc, a.id
      limit 1;

      kind := 'iklan_menunggu';
      title := 'Iklan bisnes menunggu semakan';
      preview := v_nama || ' menghantar iklan "' || v_bisnes || '"'
                 || case when v_jumlah > 1 then ' dan ' || (v_jumlah - 1) || ' lagi' else '' end
                 || '.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/semakan-iklan';
      return next;
    end if;
  end if;

  -- 2. Permintaan padam akaun — Super Admin sahaja (sama dengan list_account_deletion_requests()).
  if public.is_super_admin() then
    select count(*), max(r.created_at) into v_jumlah, v_terbaru
    from public.account_deletion_requests r
    where r.status = 'pending';

    if v_jumlah > 0 then
      select m.full_name into v_nama
      from public.account_deletion_requests r
      join public.members m on m.id = r.member_id
      where r.status = 'pending'
      order by r.created_at desc
      limit 1;

      kind := 'padam_akaun';
      title := 'Permintaan padam akaun';
      preview := v_nama || ' memohon padam akaun'
                 || case when v_jumlah > 1 then ' dan ' || (v_jumlah - 1) || ' lagi' else '' end
                 || '.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/permintaan-padam-akaun';
      return next;
    end if;
  end if;

  return;
end;
$$;

revoke all on function public.admin_notifications() from public, anon;
grant execute on function public.admin_notifications() to authenticated;

notify pgrst, 'reload schema';
