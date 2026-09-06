-- =============================================================================
-- mysaf-off — Direktori Ahli
--
-- Jalankan SELEPAS 20260906000003_member_account_linking.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Tab "Ahli" memaparkan direktori ringkas kepada SEMUA pengguna yang telah log
-- masuk. RLS pada `members` sengaja TIDAK diubah — policy `members_select`
-- kekal menyembunyikan baris orang lain daripada ahli biasa. Direktori ini
-- ialah laluan TAMBAHAN yang sempit: satu fungsi yang mendedahkan lapan kolum
-- terpilih sahaja, tiada yang lain.
-- =============================================================================


-- =============================================================================
-- 1. KOLUM avatar_url
--
-- Disediakan sekarang supaya direktori mempunyai bentuk data yang muktamad,
-- walaupun tiada muat naik gambar lagi. Nilainya kekal NULL buat masa ini dan
-- app berundur kepada avatar inisial.
-- =============================================================================

alter table public.members add column if not exists avatar_url text;


-- =============================================================================
-- 2. FUNGSI DIREKTORI
--
-- `security definer` menjadikannya berjalan sebagai pemilik fungsi (postgres,
-- yang memintas RLS), jadi setiap ahli dapat melihat senarai penuh — tetapi
-- HANYA melalui lapan kolum dalam `returns table` di bawah.
--
-- Perhatikan apa yang TIADA di sini: NRIC, alamat, pendapatan, butiran
-- pendidikan dan pekerjaan, status sekatan, `user_id`. Kolum itu kekal di
-- sebalik RLS dan hanya boleh dibaca oleh admin department atau pemilik rekod.
--
-- `id` turut ditinggalkan: skrin paparan ahli biasa tidak memerlukannya, dan
-- admin sudah boleh membaca `members` terus melalui RLS untuk mendapatkannya.
-- =============================================================================

create or replace function public.list_members_directory()
returns table (
  nombor_ahli        text,
  full_name          text,
  generasi           text,
  email              text,
  no_tel             text,
  avatar_url         text,
  status_pekerjaan   text,
  status_perkahwinan text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
    m.email,
    m.no_tel,
    m.avatar_url,
    m.status_pekerjaan,
    m.status_perkahwinan
  from public.members m
  order by m.generasi, m.full_name;
$$;

-- Direktori untuk pengguna yang telah log masuk sahaja — bukan `anon`.
revoke all on function public.list_members_directory() from public;
grant execute on function public.list_members_directory() to authenticated;
