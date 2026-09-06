-- =============================================================================
-- mysaf-off — Kuatkuasa sekatan akaun (`members.disekat`)
--
-- Jalankan SELEPAS 20260906000006_avatars_and_usrah.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- PUNCA BUG
-- ---------
-- App menyemak sekatan dengan membaca `members` melalui `user_id = auth.uid()`.
-- Rekod yang diimport dari Excel mempunyai `user_id` NULL sehingga ahli itu
-- membuka skrin Profil — hanya di situ `link_my_member_record()` dipanggil.
-- Ahli yang log masuk lalu terus ke Dashboard TIDAK pernah dipautkan, jadi
-- semakan itu tidak menemui baris apa-apa dan menyimpulkan "tidak disekat".
-- Hasilnya sekatan tidak berkesan langsung terhadap ahli yang paling mungkin
-- disekat: yang datang daripada import dan belum pernah membuka Profil.
--
-- APA YANG DIBETULKAN
-- -------------------
--   1. Satu fungsi yang menjawab "adakah akaun ini disekat" TANPA bergantung
--      pada pautan `user_id`: bila tiada rekod terpaut, ia berundur kepada
--      padanan emel akaun yang telah disahkan.
--
--   2. Sekatan dikuatkuasakan di PANGKALAN DATA, bukan sekadar di app. Supabase
--      Auth tidak tahu apa-apa tentang `disekat`, jadi token akaun yang disekat
--      kekal sah; semakan di app seorang diri hanya menyembunyikan skrin dan
--      tidak menghalang sesiapa yang memanggil PostgREST terus. Sekatan kini
--      melalui `is_super_admin`, `has_department_access`, policy `members` dan
--      direktori ahli — satu akaun yang disekat tidak lagi boleh membaca atau
--      menulis apa-apa dalam modul ahli.
-- =============================================================================


-- =============================================================================
-- 1. FUNGSI DALAMAN — "adakah akaun ini disekat?"
--
-- `security definer` memintas RLS dengan sengaja: fungsi ini dipanggil DARI
-- DALAM policy `members`, jadi bacaan biasa akan mencetuskan policy yang sama
-- sekali lagi. Ia juga membaca `auth.users`, yang tertutup kepada klien.
-- =============================================================================

create or replace function public.account_suspended(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- Rekod yang sudah dipautkan ialah jawapan muktamad.
    (
      select bool_or(m.disekat)
      from public.members m
      where m.user_id = uid
    ),
    /*
      Belum dipautkan: padankan emel akaun.

      Perhatikan apa yang TIADA di sini berbanding `link_my_member_record()`:
      syarat `email_confirmed_at is not null`, dan syarat padanan mesti TUNGGAL.
      Kedua-duanya betul untuk MEMBERI capaian — emel yang belum disahkan tidak
      boleh menuntut rekod orang lain, dan rekod bertindih perlu diputuskan oleh
      admin. Tetapi soalan di sini bertentangan arah: ia MENOLAK capaian.
      Menyalin syarat yang sama ke sini menjadikan semakan gagal-terbuka —
      akaun yang emelnya belum disahkan akan lulus walaupun rekodnya disekat.

      Jadi `bool_or` merentasi setiap rekod yang sepadan, tanpa syarat tambahan:
      satu padanan yang disekat sudah memadai. Kesilapan ke arah ini hanya
      menghalang seseorang yang emelnya sama dengan rekod yang disekat, dan itu
      memang keputusan yang selamat.
    */
    (
      select bool_or(m.disekat)
      from public.members m
      join auth.users u on u.id = uid
      where m.user_id is null
        and lower(trim(m.email)) = lower(trim(u.email))
    ),
    -- Tiada rekod ahli langsung: akaun itu belum dipadankan, bukan disekat.
    false
  );
$$;

/*
  Ditutup daripada PostgREST. Versi berparameter ini boleh ditanya tentang
  MANA-MANA uuid, jadi ia kekal fungsi dalaman sahaja — dipanggil dari dalam
  fungsi `security definer` lain, yang berjalan sebagai pemilik dan tidak
  memerlukan hak `authenticated`.
*/
revoke all on function public.account_suspended(uuid) from public, anon, authenticated;


-- =============================================================================
-- 2. FUNGSI AWAM — sekatan bagi pemanggil SENDIRI sahaja
--
-- Tiada argumen, jadi tiada cara bertanya tentang akaun orang lain. Inilah yang
-- dipanggil oleh app (`lib/suspension.ts`) dan oleh policy di bahagian 4.
-- =============================================================================

create or replace function public.my_account_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.account_suspended(auth.uid());
$$;

revoke all on function public.my_account_suspended() from public, anon;
grant execute on function public.my_account_suspended() to authenticated;


-- =============================================================================
-- 3. SEKATAN MEMATIKAN SEMUA KEBENARAN PENTADBIRAN
--
-- Kedua-dua fungsi ini ialah satu-satunya pintu kepada hak admin, jadi menutup
-- sekatan di sini menutupnya untuk setiap policy yang memanggilnya — termasuk
-- `departments`, `admin_assignments`, `generations` dan `profiles`.
--
-- Kesannya seorang Super Admin yang disekat turut kehilangan haknya. Itu memang
-- niatnya: "disekat" bermakna akaun itu tidak boleh digunakan. Pemulihan dibuat
-- melalui SQL Editor (`supabase/bootstrap_super_admin.sql`), bukan melalui app.
-- =============================================================================

create or replace function public.is_super_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.account_suspended(uid)
     and exists (
       select 1
       from public.profiles p
       where p.id = uid
         and p.role = 'super_admin'
     );
$$;

create or replace function public.has_department_access(
  dept_name  text,
  need_edit  boolean default false,
  uid        uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.account_suspended(uid)
     and (
       public.is_super_admin(uid)
       or exists (
         select 1
         from public.admin_assignments a
         join public.departments d on d.id = a.department_id
         where a.user_id = uid
           and d.name = dept_name
           and case when need_edit then a.can_edit else a.can_view end
       )
     );
$$;


-- =============================================================================
-- 4. POLICY members — akaun disekat tidak melihat apa-apa
--
-- Termasuk barisnya SENDIRI. Semakan sekatan itu sendiri TIDAK melalui policy
-- ini (`my_account_suspended()` memintas RLS), jadi app tetap dapat mengetahui
-- statusnya untuk memaparkan mesej yang betul sebelum log keluar.
-- =============================================================================

drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (
    not public.my_account_suspended()
    and (user_id = auth.uid() or public.can_view_members())
  );

drop policy if exists members_insert on public.members;
create policy members_insert on public.members
  for insert to authenticated
  with check (public.can_edit_members());

/*
  Ahli lulus policy ini untuk barisnya sendiri; kolum yang dilindungi
  dikuatkuasakan oleh `members_guard_admin_columns`. `with check` mengulang
  syarat `using` supaya baris tidak boleh dialihkan keluar dari skop capaian
  pemiliknya semasa dikemas kini.
*/
drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update to authenticated
  using (
    not public.my_account_suspended()
    and (user_id = auth.uid() or public.can_edit_members())
  )
  with check (
    not public.my_account_suspended()
    and (user_id = auth.uid() or public.can_edit_members())
  );

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete to authenticated
  using (public.can_edit_members());


-- =============================================================================
-- 5. DIREKTORI AHLI
--
-- `security definer` memintas RLS di bahagian 4, jadi sekatan mesti diulang di
-- sini — tanpa ini akaun yang disekat masih boleh membaca nama, emel dan nombor
-- telefon setiap ahli.
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
  where not public.account_suspended(auth.uid())
  order by m.generasi, m.full_name;
$$;

-- Diulang kerana `create or replace` memulihkan hak lalai Supabase, yang
-- memberikan EXECUTE kepada `anon` (lihat 20260906000005).
revoke all on function public.list_members_directory() from public, anon;
grant execute on function public.list_members_directory() to authenticated;


-- =============================================================================
-- 6. PAUTAN AKAUN
--
-- Akaun yang disekat tidak sepatutnya boleh menuntut rekod ahli baharu. Badan
-- fungsi kekal sama seperti 20260906000003 kecuali semakan tambahan itu.
-- =============================================================================

create or replace function public.link_my_member_record()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid := auth.uid();
  account_email text;
  matched_id    uuid;
  match_count   int;
begin
  if uid is null then
    return null;
  end if;

  -- Sudah dikaitkan — pulangkan rekod sedia ada supaya fungsi ini selamat
  -- dipanggil pada setiap kali skrin Profil dibuka.
  select id into matched_id from public.members where user_id = uid;
  if matched_id is not null then
    return matched_id;
  end if;

  if public.account_suspended(uid) then
    return null;
  end if;

  /*
    `email_confirmed_at` diperiksa supaya emel yang belum disahkan tidak boleh
    menuntut rekod. Bila projek mematikan pengesahan emel, Supabase menetapkan
    lajur ini semasa pendaftaran, jadi semakan ini tidak menghalang apa-apa di
    sana — ia hanya bermakna apabila pengesahan dihidupkan.
  */
  select lower(trim(u.email))
    into account_email
  from auth.users u
  where u.id = uid
    and u.email_confirmed_at is not null;

  if account_email is null or account_email = '' then
    return null;
  end if;

  /*
    Padanan mesti TUNGGAL. Bila dua rekod belum dipautkan berkongsi emel yang
    sama, tiada cara menentukan yang mana milik pengguna ini — memilih salah
    satu secara sewenang-wenang boleh menyerahkan rekod orang lain, jadi
    keputusan diserahkan kepada admin.
  */
  select count(*)
    into match_count
  from public.members m
  where m.user_id is null
    and lower(trim(m.email)) = account_email;

  if match_count <> 1 then
    return null;
  end if;

  select id
    into matched_id
  from public.members m
  where m.user_id is null
    and lower(trim(m.email)) = account_email;

  perform set_config('app.member_linking', 'on', true);

  -- `user_id is null` diulang di sini supaya dua permintaan serentak tidak
  -- boleh merampas baris yang baru sahaja dipautkan oleh yang lain.
  update public.members
     set user_id = uid
   where id = matched_id
     and user_id is null;

  if not found then
    matched_id := null;
  end if;

  perform set_config('app.member_linking', 'off', true);

  return matched_id;
end;
$$;

revoke all on function public.link_my_member_record() from public, anon;
grant execute on function public.link_my_member_record() to authenticated;


-- =============================================================================
-- 7. SEMAKAN
-- =============================================================================

do $$
declare
  blocked int;
  orphan  int;
begin
  select count(*) into blocked from public.members where disekat;

  -- Rekod disekat yang BELUM dipautkan ialah kes yang dahulunya terlepas
  -- sepenuhnya: semakan lama tidak menemuinya langsung.
  select count(*) into orphan from public.members where disekat and user_id is null;

  raise notice 'Sekatan: % rekod disekat (% daripadanya belum dipautkan ke akaun).', blocked, orphan;
end;
$$;

-- PostgREST menyimpan cache skema, jadi `my_account_suspended` tidak akan wujud
-- sebagai endpoint RPC sehingga cache itu dimuat semula.
notify pgrst, 'reload schema';
