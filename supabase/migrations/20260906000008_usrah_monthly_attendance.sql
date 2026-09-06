-- =============================================================================
-- mysaf-off — Kehadiran usrah bulanan
--
-- Jalankan SELEPAS 20260906000007_suspension_enforcement.sql.
-- Skrip ini idempotent: selamat dijalankan semula tanpa menduplikasi data.
--
-- Modul ini dimiliki oleh LAJNAH TARBIAH, sama seperti modul ahli dimiliki
-- oleh JABATAN DATA & SUMBER MANUSIA — tiada mekanisme kebenaran baharu
-- diperkenalkan, hanya `has_department_access()` sedia ada dengan nama
-- department yang berlainan.
-- =============================================================================


-- =============================================================================
-- 1. TABLE usrah_monthly_attendance
--
-- Satu baris = satu ahli, satu bulan, satu tahun. Bentuk panjang (dan bukan 12
-- kolum JAN..DIS) supaya menambah tahun tidak memerlukan perubahan skema, dan
-- supaya satu bulan boleh dibetulkan tanpa menulis semula baris setahun.
--
-- `attended` SENGAJA nullable dan ketiga-tiga keadaannya bermakna:
--   true  — hadir
--   false — tidak hadir
--   NULL  — belum ada rekod (bulan belum berlaku, atau sel kosong dalam fail)
-- =============================================================================

create table if not exists public.usrah_monthly_attendance (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  year       int  not null check (year between 2000 and 2100),
  month      int  not null check (month between 1 and 12),
  attended   boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Kunci yang menjadikan import berulang KEMAS KINI dan bukan pendua.
  unique (member_id, year, month)
);

-- Corak bacaan yang paling kerap: satu ahli, satu tahun, 12 bulan sekali gus.
create index if not exists usrah_monthly_attendance_member_year_idx
  on public.usrah_monthly_attendance (member_id, year);

drop trigger if exists usrah_monthly_attendance_set_updated_at on public.usrah_monthly_attendance;
create trigger usrah_monthly_attendance_set_updated_at
  before update on public.usrah_monthly_attendance
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 2. KEBENARAN
--
-- `has_department_access()` sudah mengandungi laluan Super Admin DAN semakan
-- sekatan akaun (lihat 20260906000007), jadi kedua-duanya tidak diulang di sini.
-- =============================================================================

create or replace function public.can_view_usrah(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH TARBIAH', false, uid);
$$;

create or replace function public.can_edit_usrah(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH TARBIAH', true, uid);
$$;

/*
  Rekod ahli bagi pengguna semasa.

  `security definer` supaya policy di bawah tidak bergantung pada RLS `members`
  untuk menjawab soalan "baris ini milik siapa" — policy yang memanggil policy
  lain menjadikan sebab sesuatu bacaan gagal jauh lebih sukar dijejaki.
*/
create or replace function public.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members where user_id = auth.uid() limit 1;
$$;

revoke all on function public.can_view_usrah(uuid) from public, anon;
revoke all on function public.can_edit_usrah(uuid) from public, anon;
revoke all on function public.my_member_id() from public, anon;

grant execute on function public.can_view_usrah(uuid) to authenticated;
grant execute on function public.can_edit_usrah(uuid) to authenticated;
grant execute on function public.my_member_id() to authenticated;


-- =============================================================================
-- 3. ROW LEVEL SECURITY
--
-- Ahli MELIHAT rekodnya sendiri tetapi tidak boleh menulis apa-apa: kehadiran
-- usrah ialah catatan yang dibuat oleh Lajnah Tarbiah tentang seseorang, bukan
-- tuntutan yang dibuat oleh orang itu sendiri.
-- =============================================================================

alter table public.usrah_monthly_attendance enable row level security;

drop policy if exists usrah_select on public.usrah_monthly_attendance;
create policy usrah_select on public.usrah_monthly_attendance
  for select to authenticated
  using (
    public.can_view_usrah()
    or (not public.my_account_suspended() and member_id = public.my_member_id())
  );

drop policy if exists usrah_insert on public.usrah_monthly_attendance;
create policy usrah_insert on public.usrah_monthly_attendance
  for insert to authenticated
  with check (public.can_edit_usrah());

drop policy if exists usrah_update on public.usrah_monthly_attendance;
create policy usrah_update on public.usrah_monthly_attendance
  for update to authenticated
  using (public.can_edit_usrah())
  with check (public.can_edit_usrah());

drop policy if exists usrah_delete on public.usrah_monthly_attendance;
create policy usrah_delete on public.usrah_monthly_attendance
  for delete to authenticated
  using (public.can_edit_usrah());


-- =============================================================================
-- 4. GRANTS
-- RLS di atas yang menentukan baris mana boleh disentuh; grant ini hanya
-- membuka pintu table kepada peranan `authenticated`.
-- =============================================================================

grant select, insert, update, delete on public.usrah_monthly_attendance to authenticated;

notify pgrst, 'reload schema';
