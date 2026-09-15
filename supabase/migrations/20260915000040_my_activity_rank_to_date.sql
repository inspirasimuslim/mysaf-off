-- =============================================================================
-- MySAFF — Tempoh lalai kedudukan berakhir HARI INI, bukan hujung tahun
--
-- Jalankan SELEPAS 20260915000039_my_activity_rank.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- `my_activity_rank()` dahulunya berakhir pada 31 Disember tahun semasa,
-- manakala skrin Penarafan admin sentiasa berakhir pada tarikh HARI INI. Dua
-- tempoh berbeza bermakna dua kedudukan berbeza untuk ahli yang sama, dan
-- perbezaan itu nyata: bulan usrah dikira bagi setiap bulan yang BERTINDIH
-- dengan tempoh, jadi hujung tahun menarik masuk bulan yang belum berlaku lagi
-- tetapi sudah ada rekod kehadiran.
--
-- Tarikh akhir lalai kini CURRENT_DATE mengikut waktu Malaysia — sama seperti
-- skrin admin. Tarikh mula kekal 1 Januari tahun semasa.
--
-- `activity_scores_internal()` dan `member_activity_score()` TIDAK disentuh:
-- kedua-duanya menerima tempoh daripada pemanggil dan tidak pernah menentukan
-- lalai sendiri. Satu-satunya tempat lalai wujud ialah fungsi di bawah.
-- =============================================================================

create or replace function public.my_activity_rank(
  p_start_date date default null,
  p_end_date   date default null
)
returns table (
  rank            integer,
  total_ahli      integer,
  total_score     integer,
  yuran_lunas     boolean,
  pipis_sumbang   boolean,
  usrah_bulan     integer,
  ada_jawatan_org boolean,
  ada_jawatan_pas boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_today     date;
  v_start     date;
  v_end       date;
begin
  v_member_id := public.my_member_id();
  if v_member_id is null then
    return;
  end if;

  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_start := coalesce(p_start_date, make_date(extract(year from v_today)::int, 1, 1));
  -- Hari ini, bukan hujung tahun. Lihat komen di atas.
  v_end   := coalesce(p_end_date, v_today);

  if v_end < v_start then
    raise exception 'Tempoh tidak sah: tarikh tamat mesti pada atau selepas tarikh mula.' using errcode = '22023';
  end if;

  return query
  with penarafan as (
    select
      s.member_id as mid,
      s.total_score as markah,
      s.yuran_lunas as s_yuran,
      s.pipis_sumbang as s_pipis,
      s.usrah_bulan as s_usrah,
      s.ada_jawatan_org as s_org,
      s.ada_jawatan_pas as s_pas,
      row_number() over (
        order by s.total_score desc, s.pipis_amount_period desc, s.full_name
      )::int as kedudukan,
      count(*) over ()::int as jumlah
    from public.activity_scores_internal(v_start, v_end) s
  )
  select
    p.kedudukan,
    p.jumlah,
    p.markah,
    p.s_yuran = 1,
    p.s_pipis = 1,
    p.s_usrah,
    p.s_org = 1,
    p.s_pas = 1
  from penarafan p
  where p.mid = v_member_id;
end;
$$;

revoke all on function public.my_activity_rank(date, date) from public, anon;
grant execute on function public.my_activity_rank(date, date) to authenticated;

notify pgrst, 'reload schema';
