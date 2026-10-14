-- =============================================================================
-- mysaf-off — NGO Rasmi (tile Direktori): senarai NGO, perihal, tahun penubuhan, jawatankuasa
--
-- Dua table: `ngos` dan `ngo_committee` (satu-ke-banyak). Semua ahli log masuk boleh BACA
-- (`can_read_shared()`); TULIS (tambah/sunting/padam NGO dan ahli jawatankuasa) hanya admin
-- department 'LAJNAH PEMBANGUNAN NGO' (can_edit) dan Super Admin — corak sama `org_positions`.
--
-- Ahli jawatankuasa disimpan sebagai nama teks (+ generasi pilihan), bukan pautan ke `members`:
-- ramai pemegang jawatan NGO ialah alumni/orang luar yang tiada rekod ahli.
--
-- Data awal: 7 NGO daripada laporan Lajnah Pembangunan Alumni & NGO 2024 (nama + jawatankuasa).
-- PERIHAL dan TAHUN PENUBUHAN ialah DATA CONTOH (ditanda "[Contoh]") — admin perlu menggantikannya.
-- Jawatankuasa iNaim tiada dalam laporan -> kosong. Data awal hanya dimasukkan untuk NGO yang
-- BARU dicipta oleh skrip ini, jadi menjalankannya semula tidak menimpa suntingan admin. Idempotent.
-- Hanya menambah objek baharu -> tiada snapshot.
-- =============================================================================

create table if not exists public.ngos (
  id              uuid primary key default gen_random_uuid(),
  nama            text not null check (length(btrim(nama)) > 0),
  nama_penuh      text,
  perihal         text,
  tahun_penubuhan integer check (tahun_penubuhan is null or tahun_penubuhan between 1900 and 2100),
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists ngos_nama_lower_idx on public.ngos ((lower(nama)));

create table if not exists public.ngo_committee (
  id            uuid primary key default gen_random_uuid(),
  ngo_id        uuid not null references public.ngos (id) on delete cascade,
  jawatan       text not null check (length(btrim(jawatan)) > 0),
  nama          text not null check (length(btrim(nama)) > 0),
  generasi      text,
  -- Pengelompokan pilihan (cth "Exco Pendidikan dan Keilmuan", "Team Media"); NULL = jawatankuasa utama.
  kumpulan      text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ngo_committee_ngo_idx on public.ngo_committee (ngo_id, display_order);

drop trigger if exists ngos_set_updated_at on public.ngos;
create trigger ngos_set_updated_at before update on public.ngos
  for each row execute function public.set_updated_at();

drop trigger if exists ngo_committee_set_updated_at on public.ngo_committee;
create trigger ngo_committee_set_updated_at before update on public.ngo_committee
  for each row execute function public.set_updated_at();

-- AKSES -------------------------------------------------------------------------

create or replace function public.can_edit_ngo(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.has_department_access('LAJNAH PEMBANGUNAN NGO', true, uid), false);
$$;

revoke all on function public.can_edit_ngo(uuid) from public, anon;
grant execute on function public.can_edit_ngo(uuid) to authenticated;

-- RLS ---------------------------------------------------------------------------

alter table public.ngos enable row level security;
alter table public.ngo_committee enable row level security;

revoke all on table public.ngos from anon;
revoke all on table public.ngo_committee from anon;
grant select, insert, update, delete on table public.ngos to authenticated;
grant select, insert, update, delete on table public.ngo_committee to authenticated;

drop policy if exists ngos_select on public.ngos;
create policy ngos_select on public.ngos for select to authenticated using (public.can_read_shared());
drop policy if exists ngos_insert on public.ngos;
create policy ngos_insert on public.ngos for insert to authenticated with check (public.can_edit_ngo());
drop policy if exists ngos_update on public.ngos;
create policy ngos_update on public.ngos for update to authenticated
  using (public.can_edit_ngo()) with check (public.can_edit_ngo());
drop policy if exists ngos_delete on public.ngos;
create policy ngos_delete on public.ngos for delete to authenticated using (public.can_edit_ngo());

drop policy if exists ngo_committee_select on public.ngo_committee;
create policy ngo_committee_select on public.ngo_committee for select to authenticated using (public.can_read_shared());
drop policy if exists ngo_committee_insert on public.ngo_committee;
create policy ngo_committee_insert on public.ngo_committee for insert to authenticated with check (public.can_edit_ngo());
drop policy if exists ngo_committee_update on public.ngo_committee;
create policy ngo_committee_update on public.ngo_committee for update to authenticated
  using (public.can_edit_ngo()) with check (public.can_edit_ngo());
drop policy if exists ngo_committee_delete on public.ngo_committee;
create policy ngo_committee_delete on public.ngo_committee for delete to authenticated using (public.can_edit_ngo());

-- DATA AWAL ---------------------------------------------------------------------

with ins as (
  insert into public.ngos (nama, nama_penuh, perihal, tahun_penubuhan, display_order)
  values
  ('IMAN', 'Ikatan Inspirasi Muslim Nasional', '[Contoh] Perihal IMAN ialah data contoh sementara. Admin Lajnah Pembangunan NGO boleh mengemas kini perihal, tahun penubuhan dan jawatankuasa.', 2014, 1),
  ('IMPAK', 'Ikatan Muslim Prihatin Kebangsaan', '[Contoh] Perihal IMPAK ialah data contoh sementara. Admin Lajnah Pembangunan NGO boleh mengemas kini perihal, tahun penubuhan dan jawatankuasa.', 2015, 2),
  ('INTAN', 'Ikatan Wanita Nasional', '[Contoh] Perihal INTAN ialah data contoh sementara. Admin Lajnah Pembangunan NGO boleh mengemas kini perihal, tahun penubuhan dan jawatankuasa.', 2016, 3),
  ('Minda Segak', 'Minda Segak Malaysia', '[Contoh] Perihal Minda Segak ialah data contoh sementara. Admin Lajnah Pembangunan NGO boleh mengemas kini perihal, tahun penubuhan dan jawatankuasa.', 2017, 4),
  ('KPK', 'Kelab Patriotisme Kelantan', '[Contoh] Perihal KPK ialah data contoh sementara. Admin Lajnah Pembangunan NGO boleh mengemas kini perihal, tahun penubuhan dan jawatankuasa.', 2018, 5),
  ('iNaim', 'Alumni SMKA Naim', '[Contoh] Perihal iNaim ialah data contoh sementara. Admin Lajnah Pembangunan NGO boleh mengemas kini perihal, tahun penubuhan dan jawatankuasa.', 2012, 6),
  ('Al-Falah', 'Alumni SMKA Falahiah', '[Contoh] Perihal Al-Falah ialah data contoh sementara. Admin Lajnah Pembangunan NGO boleh mengemas kini perihal, tahun penubuhan dan jawatankuasa.', 2013, 7)
  on conflict ((lower(nama))) do nothing
  returning id, nama
)
insert into public.ngo_committee (ngo_id, jawatan, nama, generasi, kumpulan, display_order)
select i.id, v.jawatan, v.nama, v.generasi, v.kumpulan, v.ord
from ins i
join (values
  ('IMAN', 'Pengasas / Ketua Pegawai Eksekutif', 'Fakhrurrazi Yahaya', null, null, 1),
  ('IMAN', 'Eksekutif Pemasaran & Dana', 'Syed Muhammad A''qib Bin Syed Ali', null, null, 2),
  ('IMAN', 'Eksekutif Program', 'Nik Kamal Bin Ibrahim', null, null, 3),
  ('IMAN', 'Eksekutif Pembangunan Insan', 'Syuwari Mohamad', null, null, 4),
  ('IMAN', 'Pegawai Pembangunan Insan', 'Nik Fazli', null, null, 5),
  ('IMAN', 'Eksekutif IT & Korporat', 'Zulkhairi Zaidi', null, null, 6),
  ('IMAN', 'AJK', 'Muizuddin Mukhtar', null, null, 7),
  ('IMAN', 'AJK', 'Saikul Awang Zaidani', null, null, 8),
  ('IMAN', 'AJK', 'Kushairi', null, null, 9),
  ('IMAN', 'AJK', 'Asyraf', null, null, 10),
  ('IMAN', 'AJK', 'Syahida Zol', null, null, 11),
  ('IMAN', 'AJK', 'Sarah Ridzuan', null, null, 12),
  ('IMAN', 'AJK', 'Nahusa', null, null, 13),
  ('IMAN', 'AJK', 'Aiesya', null, null, 14),
  ('IMAN', 'AJK', 'Emilia', null, null, 15),
  ('IMPAK', 'Presiden', 'Cr. Mohd Fakrul Rizal Bin Mohamed Din', null, null, 1),
  ('IMPAK', 'Timbalan Presiden', 'Abdul Fattah Hussain', null, null, 2),
  ('IMPAK', 'Setiausaha', 'Ahmad Hanafi Bin Adnan', null, null, 3),
  ('IMPAK', 'Bendahari', 'Muhamad Wizam Bin Ali', null, null, 4),
  ('IMPAK', 'Naib Presiden (Jaringan Komuniti, Sukarelawan & Antarabangsa)', 'Che Mohd Rozaihan Bin Che Rosli', null, null, 5),
  ('IMPAK', 'Naib Presiden (Guaman & Undang-Undang)', 'Mohd Firdaus Bin Yusoff', null, null, 6),
  ('IMPAK', 'Naib Presiden (Pembangunan Insan & Keagamaan)', 'Mohd Firdaus Bin Mohamad Nasir', null, null, 7),
  ('IMPAK', 'Naib Presiden (Kesihatan & Alam Sekitar)', 'Nurul Syatirah Binti Wan Ramdzan', null, null, 8),
  ('IMPAK', 'Naib Presiden (Pendidikan & Hal Ehwal Wanita)', 'Nur Izzati Binti Mohamed Jaafar', null, null, 9),
  ('IMPAK', 'Naib Presiden (Keusahawanan & Kerjaya)', 'Muhammad Iqbal Bin Ahmad Mokhjamil', null, null, 10),
  ('IMPAK', 'Naib Presiden (Teknologi Maklumat & Multimedia)', 'Farah Wadhihah Binti Abdul Kadir', null, null, 11),
  ('IMPAK', 'Penolong Setiausaha 1', 'Muhammad Zariff Bin Ilias', null, 'Jabatan Setiausaha', 12),
  ('IMPAK', 'Penolong Setiausaha 2', 'Nurizzati Binti Othman', null, 'Jabatan Setiausaha', 13),
  ('IMPAK', 'Kelantan', 'Mohd Hafiz Karami Bin Mohd Zain', null, 'Pengerusi IMPAK Negeri', 14),
  ('IMPAK', 'Terengganu', 'Zulkifli Bin Che Noh', null, 'Pengerusi IMPAK Negeri', 15),
  ('IMPAK', 'Pahang', 'Mohd FitriHelmi Bin Che Bakri', null, 'Pengerusi IMPAK Negeri', 16),
  ('IMPAK', 'Perak', 'Rosman Bin Azmi', null, 'Pengerusi IMPAK Negeri', 17),
  ('IMPAK', 'Perlis', 'Muhammad Khidir Bin Abdul Ghani', null, 'Pengerusi IMPAK Negeri', 18),
  ('IMPAK', 'Johor', 'Ahmad Aslam Bin Yusof', null, 'Pengerusi IMPAK Negeri', 19),
  ('IMPAK', 'Selangor', 'Syed Muhammad A''qib Bin Syed Ali', null, 'Pengerusi IMPAK Negeri', 20),
  ('IMPAK', 'Wilayah Persekutuan', 'Muhammad Syarifuddin Bin Mohd Lotfi', null, 'Pengerusi IMPAK Negeri', 21),
  ('IMPAK', 'Luar Negara', 'Khairul Akmal Bin Radin Ismail', null, 'Pengerusi IMPAK Negeri', 22),
  ('INTAN', 'Pengerusi', 'Amrina Rasyada binti Kamaruzaman', 'i13', null, 1),
  ('INTAN', 'Timbalan Pengerusi', 'Syukriyah bt Mat Daud', 'i13', null, 2),
  ('INTAN', 'Setiausaha', 'Nur Sabrina bt Harun', 'i13', null, 3),
  ('INTAN', 'Penolong Setiausaha', 'Aqilah bt Hj Abd Halim', 'i13', null, 4),
  ('INTAN', 'Bendahari', 'Farhana binti Mohd Razali', 'i13', null, 5),
  ('INTAN', 'Ahli Exco', 'Musfirah Nabiela binti Mohd Suhaimin', 'i13', 'Exco Pendidikan dan Keilmuan', 6),
  ('INTAN', 'Ahli Exco', 'Nurul Khairani bt Ismail', 'i08', 'Exco Pendidikan dan Keilmuan', 7),
  ('INTAN', 'Ahli Exco', 'Nurul Farihah bt Mad Rozali', 'i08', 'Exco Pendidikan dan Keilmuan', 8),
  ('INTAN', 'Ahli Exco', 'Nur Aiesya binti Faris', 'i20', 'Exco Pendidikan dan Keilmuan', 9),
  ('INTAN', 'Ahli Exco', 'Nurul Fasehah bt Mat Husain', 'i11', 'Exco Pendidikan dan Keilmuan', 10),
  ('INTAN', 'Ahli Exco', 'Najhan Farhana bt Muhd Noor', 'i11', 'Exco Kebajikan dan Kemasyarakatan', 11),
  ('INTAN', 'Ahli Exco', 'Nurul Aqilah bt Ab Syukor', 'i10', 'Exco Kebajikan dan Kemasyarakatan', 12),
  ('INTAN', 'Ahli Exco', 'Siti Mardiana bt Mat Ail', 'i07', 'Exco Kebajikan dan Kemasyarakatan', 13),
  ('INTAN', 'Ahli Exco', 'Irafiza binti Ibrahim', 'i11', 'Exco Kebajikan dan Kemasyarakatan', 14),
  ('INTAN', 'Ahli Exco', 'Wan Nur Syamimi binti Mat Zin', 'i14', 'Exco Multimedia dan Penerangan', 15),
  ('INTAN', 'Ahli Exco', 'Che Nurul Hanifah bt Md Nuri', 'i14', 'Exco Multimedia dan Penerangan', 16),
  ('INTAN', 'Ahli Exco', 'Nor Hidayah binti Mohamed', 'i11', 'Exco Multimedia dan Penerangan', 17),
  ('INTAN', 'Ahli Exco', 'Nurul Amnah binti Duniya', 'i14', 'Exco Korporat dan Dana Luar', 18),
  ('INTAN', 'Ahli Exco', 'Nor Haziratun binti Mat Hussin', 'i13', 'Exco Korporat dan Dana Luar', 19),
  ('INTAN', 'Ahli Exco', 'Norul Izzati bt Mamat', 'i09', 'Exco Korporat dan Dana Luar', 20),
  ('Minda Segak', 'Pengerusi', 'Mohammad Hanif Bin Napi', 'i10', null, 1),
  ('Minda Segak', 'Timbalan Pengerusi', 'Ahmad Fatihi Bin Makhtar', 'i10', null, 2),
  ('Minda Segak', 'Setiausaha', 'Ahmad Aslam Bin Mohd Yusof', 'i10', null, 3),
  ('Minda Segak', 'Penolong Setiausaha', 'Mohd Ridhuwan Bin Che Musa', 'i10', null, 4),
  ('Minda Segak', 'Bendahari', 'Noraini Binti Abdullah', 'i10', null, 5),
  ('Minda Segak', 'AJK', 'Syuwari Bin Mohamad', 'i18', null, 6),
  ('Minda Segak', 'AJK', 'Siti Nur Adibah Binti Mohd Sawi', 'i10', null, 7),
  ('Minda Segak', 'AJK', 'Muhamad Zariff Bin Ilias', 'i12', null, 8),
  ('Minda Segak', 'AJK', 'Siti Noraini Binti Mohd Zain', 'i10', null, 9),
  ('Minda Segak', 'AJK', 'Mohd Khomenei Bin Abdullah', 'i10', null, 10),
  ('Minda Segak', 'AJK', 'Muhammad Asyraf Bin Ahmad Rushdan', 'i21', null, 11),
  ('Minda Segak', 'AJK', 'Siti Hajar Binti Hassim', 'i10', null, 12),
  ('Minda Segak', 'AJK', 'Muhammad Syarif Bin Mohd Nor', 'i10', null, 13),
  ('Minda Segak', 'AJK', 'Mohd Zulhasif Bin Zulkifli', 'i10', null, 14),
  ('KPK', 'Pengerusi', 'Muhammad Asyraf Bin Ahmad Rushdan', null, null, 1),
  ('KPK', 'Timbalan Pengerusi', 'Mohamad Syamil Bin Muzamil', null, null, 2),
  ('KPK', 'Setiausaha 1', 'Mohammad Lokman Hakim Bin Mohd Diah', null, null, 3),
  ('KPK', 'Setiausaha 2', 'Nur Hazwani Binti Hisan', null, null, 4),
  ('KPK', 'Bendahari', 'Siti Nur Sabrina Binti Hasbullah', null, null, 5),
  ('KPK', 'Designer 1', 'Zul Irham Bin Tarmizi', null, 'Team Media', 6),
  ('KPK', 'Designer 2', 'Raja Nur ''Alia Aqilah Binti Raja Ahamad Shalaby', null, 'Team Media', 7),
  ('KPK', 'Social Media', 'Nur Shuhada Bt Mohamad Hadzri', null, 'Team Media', 8),
  ('KPK', 'Copywriting', 'Najwa Binti Yaakub', null, 'Team Media', 9),
  ('KPK', 'Ahli', 'Nor Syahida Bt Zol @ Mohd Zol', null, 'Team Program', 10),
  ('KPK', 'Ahli', 'Ahmad Zul Aziem Bin Muhammad Suhaimi', null, 'Team Program', 11),
  ('KPK', 'Ahli', 'Siti Nur Adawiyah Binti Hazman', null, 'Team Program', 12),
  ('KPK', 'Ahli', 'Nurul Izzah Binti Hamdi', null, 'Team Program', 13),
  ('Al-Falah', 'Yang Dipertua', 'Amin Bin Idris', null, null, 1),
  ('Al-Falah', 'Timbalan Yang Dipertua', 'Mohd Helmi Bin Mat Zin', null, null, 2),
  ('Al-Falah', 'Naib Yang Dipertua', 'Ameer Azeezy Bin Tuan Abdullah', null, null, 3),
  ('Al-Falah', 'Setiausaha', 'Hanafi Bin Adnan', null, null, 4),
  ('Al-Falah', 'Setiausaha Kerja', 'Syahir Bin Sulong', null, null, 5),
  ('Al-Falah', 'Bendahari', 'Azim Bin Napi', null, null, 6),
  ('Al-Falah', 'Exco Pendidikan', 'Muizzuddin Bin Mukhtar', null, null, 7),
  ('Al-Falah', 'Timb. Exco Pendidikan', 'Hafiz Karami Bin Zain', null, null, 8),
  ('Al-Falah', 'Exco Media', 'Redhuan Bin Mohd Nor', null, null, 9),
  ('Al-Falah', 'Timb. Exco Media', 'Syuawari Bin Mohamed', null, null, 10),
  ('Al-Falah', 'Exco Kebajikan', 'Sufian Bin Zakaria', null, null, 11),
  ('Al-Falah', 'Timb. Exco Kebajikan', 'Rasyidi Bin Razali', null, null, 12)
) as v(ngo, jawatan, nama, generasi, kumpulan, ord) on lower(i.nama) = lower(v.ngo);

notify pgrst, 'reload schema';
