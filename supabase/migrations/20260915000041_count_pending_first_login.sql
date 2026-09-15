-- =============================================================================
-- MySAFF — Bilangan ahli yang belum berjaya log masuk kali pertama
--
-- Jalankan SELEPAS 20260915000040_my_activity_rank_to_date.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Skrin Reset Pukal perlu menunjukkan SKOP sebelum Super Admin menekan apa-apa.
-- Kiraan itu datang dari sini dan bukan daripada membaca 325 baris `members`
-- ke dalam app: yang diperlukan hanyalah satu nombor, dan syaratnya mesti
-- sama dengan syarat yang digunakan oleh Edge Function ketika memproses.
--
-- Syarat: `user_id is not null and must_change_password`. Itu meliputi ahli
-- yang tidak pernah cuba log masuk, ahli yang tetingkap kata laluan
-- sementaranya sudah tamat sebelum sempat menukarnya, dan ahli yang pernah
-- direset tetapi masih belum menyiapkan prosesnya. Ahli yang SUDAH menetapkan
-- kata laluannya sendiri membawa `must_change_password = false` dan tidak
-- pernah termasuk — mereka sudah berjaya log masuk kali pertama.
-- =============================================================================

create or replace function public.count_pending_first_login()
returns table (
  jumlah        integer,
  tempoh_tamat  integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_super_admin(), false) then
    raise exception 'Tindakan ini khusus untuk Super Admin.' using errcode = '42501';
  end if;

  return query
  select
    count(*)::int,
    -- Antaranya, berapa yang tetingkapnya SUDAH tamat. Angka ini menjelaskan
    -- kepada admin mengapa senarai itu panjang.
    count(*) filter (
      where m.temp_password_expires_at is not null and m.temp_password_expires_at < now()
    )::int
  from public.members m
  where m.user_id is not null
    and m.must_change_password;
end;
$$;

revoke all on function public.count_pending_first_login() from public, anon;
grant execute on function public.count_pending_first_login() to authenticated;

notify pgrst, 'reload schema';
