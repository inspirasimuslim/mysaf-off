-- =============================================================================
-- mysaf-off — Ahli MBM (pasangan sesama ahli)
--
-- Jalankan SELEPAS 20260918000048_export_audit_fixes.sql. Idempotent.
--
-- Ahli yang berkahwin sesama ahli (status_perkahwinan = 'berkahwin_mbm') kini
-- dipautkan kepada rekod PASANGANnya sendiri (`spouse_member_id`), bukan
-- sekadar teks bebas `nama_pasangan`. Pasangan BUKAN ahli
-- ('berkahwin_bukan_mbm') kekal menggunakan `nama_pasangan` seperti sedia ada
-- — tiada rekod ahli untuk dipautkan.
-- =============================================================================


-- =============================================================================
-- 1. KOLUM BAHARU
-- =============================================================================

alter table public.members
  add column if not exists spouse_member_id uuid references public.members (id) on delete set null,
  add column if not exists nama_anak text;

alter table public.members drop constraint if exists members_spouse_not_self;
alter table public.members
  add constraint members_spouse_not_self check (spouse_member_id is distinct from id);

create index if not exists members_spouse_member_id_idx on public.members (spouse_member_id);


-- =============================================================================
-- 2. TRIGGER — PAUTAN DUA HALA
--
-- Bila `spouse_member_id` satu baris ditetapkan, baris PASANGAN itu turut
-- ditetapkan menunjuk balik — dan sebaliknya bila dikosongkan.
--
-- `pg_trigger_depth() > 1` menghalang rekursi tak terhingga: lapisan PERTAMA
-- (kemas kini pengguna) terus menulis KEDUA-DUA belah pautan secara eksplisit,
-- termasuk memutuskan pasangan LAMA (kedua-dua belah, jika ada) sebelum
-- menetapkan yang baharu — supaya seorang ahli tidak pernah tersangkut dengan
-- dua pasangan serentak. Kemas kini BERSARANG yang disebabkan oleh langkah itu
-- sendiri (kedalaman > 1) tidak memproses lagi kerana kerjanya sudah selesai.
-- =============================================================================

create or replace function public.sync_spouse_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Nyahpaut pasangan LAMA, jika ia masih menunjuk ke baris ini.
  if old.spouse_member_id is not null then
    update public.members
       set spouse_member_id = null
     where id = old.spouse_member_id
       and spouse_member_id = old.id;
  end if;

  if new.spouse_member_id is not null then
    -- Pasangan BAHARU mungkin sudah terpaut kepada orang lain — putuskan
    -- pautan itu dahulu supaya setiap ahli hanya mempunyai SATU pasangan.
    update public.members
       set spouse_member_id = null
     where id in (select m.spouse_member_id from public.members m where m.id = new.spouse_member_id)
       and id <> new.id;

    update public.members
       set spouse_member_id = new.id
     where id = new.spouse_member_id
       and spouse_member_id is distinct from new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists members_sync_spouse_link on public.members;
create trigger members_sync_spouse_link
  before update on public.members
  for each row
  when (new.spouse_member_id is distinct from old.spouse_member_id)
  execute function public.sync_spouse_link();


-- =============================================================================
-- 3. RPC — SENARAI AHLI UNTUK PEMILIH PASANGAN (borang, semua ahli)
--
-- Mendedahkan `id` + nama + generasi + jantina sahaja. Ini SELAMAT walaupun
-- `list_members_directory()` sengaja menyembunyikan `id`: `id` sahaja tidak
-- membuka rekod sesiapa — RLS pada `members` tetap menyekat SELECT baris orang
-- lain, dan UPDATE hanya berjaya pada baris SENDIRI (lihat `members_update`).
-- Ia cuma membolehkan borang menyimpan RUJUKAN kepada ahli lain sebagai
-- pasangan.
-- =============================================================================

create or replace function public.list_members_picker()
returns table (
  id        uuid,
  full_name text,
  generasi  text,
  jantina   text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.full_name, m.generasi, m.jantina
  from public.members m
  where public.can_read_shared()
  order by m.full_name;
$$;

revoke all on function public.list_members_picker() from public, anon;
grant execute on function public.list_members_picker() to authenticated;


-- =============================================================================
-- 4. RPC — SENARAI PASANGAN MBM (semua ahli, field terhad)
--
-- Satu baris setiap PASANGAN (bukan setiap ahli): join kepada diri sendiri
-- dengan `a.id < b.id` mengelak pasangan yang sama terpapar dua kali, dan
-- syarat pautan DUA HALA (`b.spouse_member_id = a.id` DAN sebaliknya) mengelak
-- pasangan tak lengkap/sehala daripada terpapar sama sekali.
-- =============================================================================

create or replace function public.list_mbm_couples()
returns table (
  nama_suami      text,
  generasi_suami  text,
  nama_isteri     text,
  generasi_isteri text,
  tahun_berkahwin text,
  bil_anak        int,
  nama_anak       text
)
language sql
stable
security definer
set search_path = public
as $$
  with pasangan as (
    select
      a.full_name as nama_a, a.generasi as generasi_a, a.jantina as jantina_a,
      a.tahun_berkahwin as tahun_a, a.bil_anak as anak_a, a.nama_anak as nama_anak_a,
      b.full_name as nama_b, b.generasi as generasi_b, b.jantina as jantina_b,
      b.tahun_berkahwin as tahun_b, b.bil_anak as anak_b, b.nama_anak as nama_anak_b
    from public.members a
    join public.members b
      on b.id = a.spouse_member_id
     and a.id = b.spouse_member_id
    where a.id < b.id
  )
  select
    case when jantina_a = 'Muslimin' then nama_a
         when jantina_b = 'Muslimin' then nama_b
         else nama_a end as nama_suami,
    case when jantina_a = 'Muslimin' then generasi_a
         when jantina_b = 'Muslimin' then generasi_b
         else generasi_a end as generasi_suami,
    case when jantina_a = 'Muslimat' then nama_a
         when jantina_b = 'Muslimat' then nama_b
         else nama_b end as nama_isteri,
    case when jantina_a = 'Muslimat' then generasi_a
         when jantina_b = 'Muslimat' then generasi_b
         else generasi_b end as generasi_isteri,
    coalesce(nullif(trim(tahun_a), ''), nullif(trim(tahun_b), '')) as tahun_berkahwin,
    coalesce(anak_a, anak_b) as bil_anak,
    coalesce(nullif(trim(nama_anak_a), ''), nullif(trim(nama_anak_b), '')) as nama_anak
  from pasangan
  where public.can_read_shared()
  order by generasi_suami nulls last, nama_suami;
$$;

revoke all on function public.list_mbm_couples() from public, anon;
grant execute on function public.list_mbm_couples() to authenticated;

notify pgrst, 'reload schema';
