-- =============================================================================
-- Perkaderan Usrah Sekolah — privasi mad'u (pelajar, kebanyakannya bawah 18 tahun)  (2026-11-25)
--
--  1. Medan baharu pada `sekolah_usrah_mad_u`: `kelas` dan `no_tel` (kedua-duanya pilihan).
--     Naqib kumpulan itu dan admin LAJNAH PERKADERAN boleh membacanya (RLS baris sedia ada).
--  2. Simpanan: mad'u yang dinyahaktifkan dipadam KEKAL 6 bulan kemudian (pg_cron harian).
--     `nyahaktif_at` ditetapkan oleh pencetus; mengaktifkan semula mengosongkannya.
--     Mad'u dalam kumpulan yang diarkibkan lebih 6 bulan turut dipadam.
--  3. Padam kekal serta-merta oleh admin LAJNAH PERKADERAN (`perkaderan_padam_mad_u`) — kehadiran
--     mad'u itu turut hilang (FK cascade). Naqib hanya boleh menyahaktif, bukan memadam kekal.
--  4. Hak `TRUNCATE/REFERENCES/TRIGGER` ditarik daripada `authenticated` (tetapan lalai Supabase;
--     tidak boleh dicapai melalui PostgREST, ditarik sebagai kebersihan).
-- =============================================================================

alter table public.sekolah_usrah_mad_u
  add column if not exists kelas text,
  add column if not exists no_tel text,
  add column if not exists nyahaktif_at timestamptz;

alter table public.sekolah_usrah_mad_u drop constraint if exists sekolah_usrah_mad_u_kelas_len;
alter table public.sekolah_usrah_mad_u add constraint sekolah_usrah_mad_u_kelas_len
  check (kelas is null or char_length(kelas) between 1 and 40);

alter table public.sekolah_usrah_mad_u drop constraint if exists sekolah_usrah_mad_u_no_tel_fmt;
alter table public.sekolah_usrah_mad_u add constraint sekolah_usrah_mad_u_no_tel_fmt
  check (no_tel is null or no_tel ~ '^[0-9+][0-9 -]{6,18}$');

-- Baris yang sudah tidak aktif (jika ada) mula dikira simpanan dari sekarang.
update public.sekolah_usrah_mad_u set nyahaktif_at = now() where not is_active and nyahaktif_at is null;

create or replace function public.sekolah_usrah_mad_u_track_inactive()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.nyahaktif_at := case when new.is_active then null else now() end;
  elsif new.is_active is distinct from old.is_active then
    new.nyahaktif_at := case when new.is_active then null else now() end;
  end if;
  return new;
end $$;

drop trigger if exists sekolah_usrah_mad_u_track_inactive on public.sekolah_usrah_mad_u;
create trigger sekolah_usrah_mad_u_track_inactive
  before insert or update on public.sekolah_usrah_mad_u
  for each row execute function public.sekolah_usrah_mad_u_track_inactive();

-- ---------------------------------------------------------------------------
-- Padam kekal serta-merta (admin LAJNAH PERKADERAN / Super Admin sahaja)
-- ---------------------------------------------------------------------------
create or replace function public.perkaderan_padam_mad_u(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.can_edit_perkaderan()) then
    raise exception 'Tiada kebenaran memadam rekod mad''u.' using errcode = '42501';
  end if;
  delete from public.sekolah_usrah_mad_u where id = p_id;
end $$;
revoke all on function public.perkaderan_padam_mad_u(uuid) from public, anon;
grant execute on function public.perkaderan_padam_mad_u(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pembersihan automatik: 6 bulan selepas dinyahaktifkan
-- ---------------------------------------------------------------------------
create or replace function public.perkaderan_purge_expired()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_a integer;
  v_b integer;
begin
  delete from public.sekolah_usrah_mad_u
   where not is_active and nyahaktif_at is not null and nyahaktif_at < now() - interval '6 months';
  get diagnostics v_a = row_count;

  delete from public.sekolah_usrah_mad_u m
   using public.sekolah_usrah_groups g
   where m.group_id = g.id and not g.is_active and g.updated_at < now() - interval '6 months';
  get diagnostics v_b = row_count;

  return v_a + v_b;
end $$;
revoke all on function public.perkaderan_purge_expired() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('perkaderan-purge');
exception when others then null;
end $$;
select cron.schedule('perkaderan-purge', '15 19 * * *', $cron$select public.perkaderan_purge_expired()$cron$);  -- 03:15 waktu Malaysia

-- ---------------------------------------------------------------------------
-- Tarik balik hak yang tidak diperlukan
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger on
  public.sekolah_usrah_groups, public.sekolah_usrah_mad_u,
  public.sekolah_usrah_sessions, public.sekolah_usrah_attendance,
  public.perkaderan_naqib_assignments
from authenticated, anon;
