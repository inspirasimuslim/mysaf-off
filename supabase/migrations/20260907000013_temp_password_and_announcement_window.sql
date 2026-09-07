-- =============================================================================
-- mysaf-off — Tempoh pengumuman + kata laluan sementara seragam
--
-- Jalankan SELEPAS 20260907000012_announcements_and_directory.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Dua perkara yang tidak berkaitan, disatukan kerana kedua-duanya menambah
-- kolum sahaja dan tiada satu pun menyentuh data sedia ada:
--
--   1. Pengumuman mendapat tetingkap tarikh, supaya ia boleh disediakan awal
--      dan berhenti sendiri.
--   2. Ahli mendapat kata laluan sementara yang seragam dan bertempoh, supaya
--      akaun boleh diedarkan secara pukal tanpa menghantar rahsia berbeza
--      kepada setiap orang.
-- =============================================================================


-- =============================================================================
-- 1. TETINGKAP PENGUMUMAN
--
-- Tarikh sahaja, tanpa masa. Pengumuman ialah perkara sepanjang hari; menambah
-- jam bermakna admin perlu memutuskan sesuatu yang dia tidak pernah fikirkan,
-- dan salah satunya akan menjadi salah.
--
-- Kedua-duanya NULLABLE dan ketiadaannya bermakna:
--   start_date NULL — papar serta-merta
--   end_date   NULL — tiada tarikh tamat
-- =============================================================================

alter table public.announcements
  add column if not exists start_date date,
  add column if not exists end_date   date;

alter table public.announcements drop constraint if exists announcements_range_check;
alter table public.announcements add constraint announcements_range_check
  check (start_date is null or end_date is null or end_date >= start_date);


-- =============================================================================
-- 2. KATA LALUAN SEMENTARA
--
-- `must_change_password` ialah tanda pentadbiran, bukan keadaan Auth — sama
-- seperti `disekat`. Supabase Auth tidak tahu apa-apa mengenainya, jadi akaun
-- dengan kata laluan sementara tetap boleh log masuk dan mendapat token yang
-- sah. Yang menghalangnya daripada pergi ke mana-mana ialah gate dalam app.
--
-- Itu MEMADAI, dan sengaja. Ini bukan sempadan keselamatan: kata laluan
-- 'ikhwandihati' diketahui umum sejak saat ia dicetak, jadi tiada apa untuk
-- dilindungi. Yang dilindungi ialah TEMPOHnya — dan itu dikuatkuasakan dengan
-- membuang akaun daripada sesi apabila tarikh luput berlalu.
--
-- Default `false` bermakna 325 rekod sedia ada TIDAK terjejas: sesiapa yang
-- sudah mempunyai akaun dan sudah menetapkan kata laluannya sendiri tidak akan
-- tiba-tiba dipaksa menukarnya.
-- =============================================================================

alter table public.members
  add column if not exists must_change_password    boolean not null default false,
  add column if not exists temp_password_expires_at timestamptz;


/*
  Keadaan kata laluan bagi pemanggil sendiri.

  `security definer` atas sebab yang sama seperti `my_account_suspended()`:
  gate app perlu jawapan sebelum ia mempercayai apa-apa lagi, dan bergantung
  pada RLS `members` bermakna jawapan itu boleh berubah mengikut policy yang
  tiada kaitan dengan kata laluan.

  Padanan melalui `user_id` sahaja, TIDAK seperti `account_suspended()` yang
  turut memadan emel. Arah keputusannya bertentangan: fungsi itu MENOLAK capaian
  dan mesti gagal-tertutup, manakala fungsi ini MEMAKSA satu skrin dan patut
  gagal-terbuka. Akaun yang belum dipautkan tidak pernah menerima kata laluan
  sementara — provisioning sentiasa menetapkan `user_id` dalam transaksi yang
  sama — jadi tiada kes sebenar yang terlepas.
*/
create or replace function public.my_password_status()
returns table (
  must_change boolean,
  expires_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(m.must_change_password, false),
    m.temp_password_expires_at
  from public.members m
  where m.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.my_password_status() from public, anon;
grant execute on function public.my_password_status() to authenticated;


/*
  Dipanggil oleh ahli SENDIRI, sebaik dia menetapkan kata laluan barunya.

  Tiada parameter, jadi tiada cara memadamkan tanda itu bagi orang lain. Ia
  tidak menyemak sama ada kata laluan benar-benar bertukar — `auth.updateUser()`
  sudah gagal sendiri jika tidak, dan app hanya sampai ke sini selepas panggilan
  itu berjaya.
*/
create or replace function public.complete_password_change()
returns void
language sql
security definer
set search_path = public
as $$
  update public.members
  set must_change_password = false,
      temp_password_expires_at = null,
      updated_at = now()
  where user_id = auth.uid();
$$;

revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;


/*
  Buka semula tetingkap log masuk sementara bagi seorang ahli.

  `is_super_admin()` dan BUKAN `can_edit_members()`, dengan sengaja. Kebenaran
  department membenarkan seseorang menyunting rekod; fungsi ini pula memberi
  seseorang tiga hari untuk log masuk dengan kata laluan yang diketahui umum.
  Itu perbezaan jenis, bukan darjah — jadi ia memerlukan peranan yang lebih
  tinggi, bukan kebenaran yang sama.
*/
create or replace function public.reset_member_login_window(p_member_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz;
begin
  /*
    `errcode` dalam kelas 'MS' (mysaf) dan BUKAN 'P0004'.

    P0000–P0004 dimiliki oleh PL/pgSQL, dan P0004 khususnya ialah
    `assert_failure` — satu-satunya keadaan selain pembatalan pertanyaan yang
    `exception when others` TIDAK tangkap. Menggunakannya untuk penolakan
    kebenaran biasa menjadikan ralat ini mustahil dikendalikan oleh pemanggil
    plpgsql, termasuk skrip ujian.

    Kelas 'MS' tidak digunakan oleh PostgreSQL, jadi ia selamat untuk kod
    aplikasi.
  */
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Hanya Super Admin boleh menetapkan semula tempoh log masuk.'
      using errcode = 'MS001';
  end if;

  v_expires := now() + interval '3 days';

  update public.members
  set must_change_password = true,
      temp_password_expires_at = v_expires,
      updated_at = now()
  where id = p_member_id;

  if not found then
    raise exception 'Rekod ahli tidak dijumpai.' using errcode = 'MS002';
  end if;

  return v_expires;
end;
$$;

revoke all on function public.reset_member_login_window(uuid) from public, anon;
grant execute on function public.reset_member_login_window(uuid) to authenticated;


-- =============================================================================
-- 3. HUBUNGI SUPER ADMIN
--
-- Satu-satunya fungsi dalam projek ini yang `anon` DIBENARKAN memanggil, dan
-- itu keputusan produk yang disengajakan, bukan terlepas pandang.
--
-- Skrin log masuk ialah tempat orang berada apabila mereka TIDAK boleh log
-- masuk — kata laluan sementara tamat tempoh, akaun disekat, emel salah. Nombor
-- bantuan yang hanya kelihatan selepas log masuk tidak membantu sesiapa yang
-- benar-benar memerlukannya.
--
-- Yang terdedah ialah nama dan nombor telefon segelintir pemegang jawatan —
-- maklumat yang memang diedarkan dalam organisasi. Tiada emel, tiada id, tiada
-- kolum lain, dan hanya bagi akaun yang berperanan `super_admin`.
-- =============================================================================

create or replace function public.list_super_admin_contacts()
returns table (
  full_name text,
  no_tel    text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.full_name, m.no_tel
  from public.members m
  join public.profiles p on p.id = m.user_id
  where p.role = 'super_admin'
    and not m.disekat
  order by m.full_name;
$$;

revoke all on function public.list_super_admin_contacts() from public;
grant execute on function public.list_super_admin_contacts() to anon, authenticated;

notify pgrst, 'reload schema';
