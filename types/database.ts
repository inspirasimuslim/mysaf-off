/**
 * Bentuk baris table Supabase yang digunakan oleh app.
 * Selari dengan `supabase/migrations/20260906000001_roles_permissions.sql`.
 */

/** 'owner' hanya boleh ditetapkan melalui SQL Editor — lihat `20260925000063_owner_recovery.sql`. */
export type UserRole = 'owner' | 'super_admin' | 'admin' | 'ahli';

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
};

export type Department = {
  id: string;
  name: string;
  is_active: boolean;
};

export type AdminAssignment = {
  id: string;
  user_id: string;
  department_id: string;
  can_view: boolean;
  can_edit: boolean;
};

/** Kebenaran satu department tanpa metadata baris — bentuk yang diedit dalam borang. */
export type Permission = {
  can_view: boolean;
  can_edit: boolean;
};

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Owner',
  super_admin: 'Super Admin',
  admin: 'Admin',
  ahli: 'Ahli',
};

/** Nama paparan untuk satu profil: nama penuh > emel > "Tanpa nama". */
export function profileName(profile: Pick<Profile, 'full_name' | 'email'>): string {
  const name = profile.full_name?.trim();
  if (name) return name;
  const email = profile.email?.trim();
  if (email) return email;
  return 'Tanpa nama';
}

// =============================================================================
// Modul Senarai Ahli
// Selari dengan `supabase/migrations/20260906000002_members.sql`.
// =============================================================================

export type Generation = {
  id: string;
  code: string;
  label: string;
  is_active: boolean;
};

export type StatusPekerjaan = 'bekerja' | 'suri_rumah' | 'tidak_bekerja' | 'pesara';

export type EducationPeringkat =
  | 'stpm'
  | 'diploma'
  | 'matrikulasi'
  | 'asasi'
  | 'sijil_tvet'
  | 'program_perguruan'
  | 'sarjana_muda'
  | 'sarjana'
  | 'phd'
  | 'lain_lain';

/** Status pengajian SATU baris `member_education` — bukan lagi medan tunggal `Member`. */
export type StatusPengajianEntry = 'tamat' | 'sedang_menjalani';

/** Hanya bermakna bila baris itu `status_pengajian = 'sedang_menjalani'`. */
export type SumberPembiayaan = 'ptptn' | 'jpa' | 'biasiswa_lain' | 'sendiri' | 'lain_lain';

export type SektorPekerjaan = 'kerajaan' | 'swasta' | 'glc' | 'sendiri';

export type BidangKerajaan =
  | 'pentadbiran'
  | 'pendidikan'
  | 'kesihatan'
  | 'kejuruteraan'
  | 'teknologi_maklumat'
  | 'kewangan'
  | 'perundangan'
  | 'keselamatan'
  | 'penguatkuasaan'
  | 'pertanian_perikanan'
  | 'sains_penyelidikan'
  | 'kebajikan_sosial'
  | 'agama'
  | 'media_kebudayaan'
  | 'kemahiran_sokongan'
  | 'lain_lain';

export type KumpulanBidangSwasta =
  | 'perkhidmatan_perdagangan'
  | 'perindustrian_sumber_asli'
  | 'profesional_pengurusan'
  | 'kreatif_media'
  | 'kemahiran_tvet';

/** Nilai unik merentas kumpulan, kecuali 'lain_lain' yang wujud di hujung setiap kumpulan. */
export type BidangKhususSwasta =
  | 'peruncitan_perdagangan'
  | 'logistik_pengangkutan'
  | 'pelancongan_hospitaliti'
  | 'makanan_minuman_fnb'
  | 'hartanah'
  | 'automotif_servis'
  | 'keselamatan'
  | 'sukan_kecergasan'
  | 'warga_emas_penjagaan'
  | 'pendidikan_swasta'
  | 'kesihatan_swasta'
  | 'kebajikan_sosial_ngo'
  | 'agama_swasta'
  | 'penguatkuasaan_swasta'
  | 'pembuatan'
  | 'minyak_gas_tenaga'
  | 'perladangan_agrikultur'
  | 'perikanan_akuakultur'
  | 'penternakan'
  | 'perlombongan_kuari'
  | 'ekonomi_hijau_esg'
  | 'perundangan'
  | 'kejuruteraan'
  | 'seni_bina_perancangan_bandar'
  | 'sumber_manusia_perundingan'
  | 'pemasaran_pengiklanan'
  | 'pentadbiran'
  | 'teknologi_maklumat'
  | 'kewangan'
  | 'sains_penyelidikan'
  | 'media_penyiaran'
  | 'industri_kreatif'
  | 'pencipta_kandungan'
  | 'fesyen_kraf'
  | 'kebudayaan'
  | 'pertukangan'
  | 'kecantikan_dandanan'
  | 'pembaikan'
  | 'penyelenggaraan'
  | 'lain_lain';

export type JenisKerjaSendiri = 'pekerja_gig' | 'freelance' | 'pencipta_kandungan' | 'lain_lain';

export type StatusPerkahwinan = 'bujang' | 'berkahwin' | 'pernah_berkahwin';

export type SebabPerkahwinanBerakhir = 'bercerai' | 'kematian_pasangan';

export type PendapatanRange =
  | '<1000'
  | '1000-2999'
  | '3000-4999'
  | '5000-9999'
  | '10000-14999'
  | '15000-19999'
  | '20000+';

export type BusinessMode = 'online' | 'offline' | 'kedua_dua';

export type BusinessSubKategori =
  | 'e_dagang'
  | 'reseller_dropship'
  | 'perkhidmatan_digital'
  | 'affiliate_marketing'
  | 'runcit_kedai'
  | 'makanan_minuman'
  | 'perkhidmatan'
  | 'pertanian_ternakan'
  | 'automotif'
  | 'lain_lain';

export type Member = {
  id: string;

  // --- Identiti ---
  nombor_ahli: string | null;
  generasi: string | null;
  full_name: string;
  nama_panggilan: string | null;
  jantina: string | null;
  nric: string | null;
  email: string | null;
  no_tel: string | null;
  alamat: string | null;
  alamat_semasa: string | null;
  kawasan_usrah: string | null;
  avatar_url: string | null;
  disekat: boolean;

  // --- Komitmen (Ikhwan/PAS) ---
  /** Suis berasingan — ON bermaksud ahli ada komitmen Ikhwan untuk diisi (bukan sekadar medan kosong belum diisi). */
  jawatan_ikhwan_aktif: boolean;
  jawatan_ikhwan_1: string | null;
  jawatan_ikhwan_2: string | null;
  /** Suis berasingan — ON bermaksud ahli ada komitmen PAS untuk diisi. */
  jawatan_pas_aktif: boolean;
  jawatan_pas_1: string | null;
  jawatan_pas_2: string | null;
  no_keahlian_pas: string | null;

  // --- Pendidikan ---
  /** FK `schools.id` — diurus admin (Super Admin), GANTI teks bebas lama. Peringkat selepas SPM kini `MemberEducation` (1-ke-banyak), bukan medan flat di sini. */
  sekolah_id: string | null;

  // --- Pekerjaan ---
  /** Toggle "Sudah Bekerja" ON/OFF diderivasi daripada nilai ini (=== 'bekerja'), bukan kolum berasingan. */
  status_pekerjaan: StatusPekerjaan | null;
  sektor_pekerjaan: SektorPekerjaan | null;
  /** Hanya bermakna bila `sektor_pekerjaan = 'kerajaan'`. */
  bidang_kerajaan: BidangKerajaan | null;
  /** Teks bebas — hanya bila `bidang_kerajaan = 'lain_lain'`. */
  bidang_kerajaan_lain_teks: string | null;
  /** Hanya bermakna bila sektor `swasta` atau `glc`. */
  kumpulan_bidang_swasta: KumpulanBidangSwasta | null;
  bidang_khusus_swasta: BidangKhususSwasta | null;
  /** Teks bebas — hanya bila `bidang_khusus_swasta = 'lain_lain'`. */
  bidang_khusus_swasta_lain_teks: string | null;
  /** Hanya bermakna bila sektor `sendiri` DAN ahli TIADA baris `member_businesses`. Tiada lagi teks "lain_lain" berasingan — lihat `bidang_kerja_sendiri_lain_teks`. */
  jenis_kerja_sendiri: JenisKerjaSendiri | null;
  /** Teks bebas "Bidang" — sentiasa dipaparkan untuk sektor `sendiri` (tidak berniaga); nama kolum kekal walau tidak lagi khusus `lain_lain`. */
  bidang_kerja_sendiri_lain_teks: string | null;
  /** Teks bebas — hanya bila `status_pekerjaan = 'pesara'`. */
  bidang_pekerjaan_lama: string | null;
  jawatan_pekerjaan: string | null;
  nama_majikan: string | null;
  negeri_tempat_kerja: string | null;
  anggaran_pendapatan_range: PendapatanRange | null;

  // --- Keluarga ---
  status_perkahwinan: StatusPerkahwinan | null;
  /** Teks bebas — pasangan BUKAN ahli sahaja. Pasangan ahli guna `spouse_member_id`. */
  nama_pasangan: string | null;
  /** Rekod ahli PASANGAN. Dua hala — lihat trigger `sync_spouse_link`. Mana satu (ini/`nama_pasangan`) yang terisi menentukan paparan MBM/Bukan MBM dalam borang — bukan kolum berasingan. */
  spouse_member_id: string | null;
  tahun_berkahwin: string | null;
  bil_anak: number | null;
  /**
   * Jawapan "Adakah anda cenderung untuk memilih pasangan Baitul Muslim?" —
   * hanya ditanya bila bujang DAN umur > 22 (dikira daripada NRIC), jadi
   * nullable. true = Ya, false = Tidak.
   */
  cenderung_baitul_muslim: boolean | null;
  /** Hanya bermakna bila `status_perkahwinan = 'pernah_berkahwin'`. */
  sebab_bercerai_kematian: SebabPerkahwinanBerakhir | null;

  // --- Pautan akaun ---
  user_id: string | null;

  /** Kali terakhir ahli SENDIRI mengubah maklumatnya. Diurus trigger sahaja. */
  self_updated_at: string | null;
};

/** Bentuk baris untuk skrin senarai — kolum berat tidak dibaca. */
export type MemberSummary = Pick<
  Member,
  'id' | 'nombor_ahli' | 'generasi' | 'full_name' | 'email' | 'disekat' | 'self_updated_at'
>;

/**
 * Baris direktori — hasil `list_members_directory()`.
 *
 * Sengaja BUKAN `Pick<Member, ...>`: bentuk ini ditentukan oleh fungsi SQL,
 * bukan oleh table. Menjadikannya jenis berasingan bermakna menambah kolum pada
 * `Member` tidak diam-diam mengisytiharkan kolum itu selamat untuk direktori.
 */
export type DirectoryMember = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  email: string | null;
  no_tel: string | null;
  avatar_url: string | null;
  status_pekerjaan: StatusPekerjaan | null;
  status_perkahwinan: StatusPerkahwinan | null;
  /** Jawatan PERTAMA ahli dalam carta organisasi (`org_positions`), atau null. */
  jawatan: string | null;
};

/**
 * Baris pemilih pasangan — hasil `list_members_picker()`.
 *
 * Mendedahkan `id`, tidak seperti `DirectoryMember`: borang perlu menyimpan
 * RUJUKAN kepada ahli lain (`spouse_member_id`), bukan sekadar memaparkannya.
 * Lihat nota keselamatan dalam `20260920000049_mbm_couples.sql`.
 */
export type MemberPickerRow = {
  id: string;
  full_name: string;
  generasi: string | null;
  jantina: string | null;
};

/** Satu pasangan MBM — hasil `list_mbm_couples()`. Field terhad, bukan `Member` penuh. */
export type MbmCouple = {
  nama_suami: string;
  generasi_suami: string | null;
  nama_isteri: string;
  generasi_isteri: string | null;
  tahun_berkahwin: string | null;
  bil_anak: number | null;
};

/**
 * Label ringkas untuk direktori — lebih pendek daripada label borang, kerana
 * ia dibaca sekilas pada kad dan bukan dipilih dari dropdown.
 */
const DIRECTORY_PEKERJAAN_LABEL: Record<StatusPekerjaan, string> = {
  bekerja: 'Bekerja',
  suri_rumah: 'Suri Rumah',
  tidak_bekerja: 'Tidak Bekerja',
  pesara: 'Pesara',
};

export function directoryPekerjaanLabel(value: StatusPekerjaan | null): string {
  return value ? DIRECTORY_PEKERJAAN_LABEL[value] : '—';
}

const DIRECTORY_PERKAHWINAN_LABEL: Record<StatusPerkahwinan, string> = {
  bujang: 'Bujang',
  berkahwin: 'Berkahwin',
  pernah_berkahwin: 'Pernah Berkahwin',
};

/** Direktori tidak membezakan MBM / bukan MBM — itu butiran dalaman rekod. */
export function directoryPerkahwinanLabel(value: StatusPerkahwinan | null): string {
  return value ? DIRECTORY_PERKAHWINAN_LABEL[value] : '—';
}

/** 'i07' → 7, supaya generasi disusun mengikut nombor dan bukan abjad. */
export function generationOrder(code: string | null): number {
  if (!code) return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(code.replace(/^i/i, ''), 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

/** Inisial untuk avatar sandaran: 'SYAHMUN B. HJ. YAHAYA' → 'SY'. */
export function memberInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = words[0] as string;
  // Nama kedua selalunya bin/binti/b./hj. — bukan inisial yang bermakna.
  const second = words.find((word, index) => index > 0 && !/^(bin|binti|bt|b|hj|hjh|haji|hajah)\.?$/i.test(word));
  if (second) return (first.charAt(0) + second.charAt(0)).toUpperCase();
  return first.slice(0, 2).toUpperCase();
}

/** Kolum yang hanya boleh diubah oleh admin — dikuatkuasakan oleh trigger di Supabase. */
export const MEMBER_ADMIN_COLUMNS = ['nombor_ahli', 'generasi', 'email', 'disekat'] as const;

// --- Pilihan dropdown --------------------------------------------------------
// `label` ialah teks BM yang dipapar; `value` ialah nilai yang disimpan.

export type Option<T extends string> = { value: T; label: string };

export const EDUCATION_PERINGKAT_OPTIONS: Option<EducationPeringkat>[] = [
  { value: 'stpm', label: 'STPM' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'matrikulasi', label: 'Matrikulasi' },
  { value: 'asasi', label: 'Asasi' },
  { value: 'sijil_tvet', label: 'Sijil / TVET' },
  { value: 'program_perguruan', label: 'Program Perguruan' },
  { value: 'sarjana_muda', label: 'Sarjana Muda' },
  { value: 'sarjana', label: 'Sarjana' },
  { value: 'phd', label: 'Doktor Falsafah (PhD)' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

export const STATUS_PENGAJIAN_ENTRY_OPTIONS: Option<StatusPengajianEntry>[] = [
  { value: 'tamat', label: 'Tamat Pengajian' },
  { value: 'sedang_menjalani', label: 'Sedang Menjalani Pengajian' },
];

export const SUMBER_PEMBIAYAAN_OPTIONS: Option<SumberPembiayaan>[] = [
  { value: 'ptptn', label: 'PTPTN' },
  { value: 'jpa', label: 'JPA' },
  { value: 'biasiswa_lain', label: 'Biasiswa Lain' },
  { value: 'sendiri', label: 'Sendiri' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

/** Label penuh (4 nilai) — untuk paparan/laporan. Borang guna dropdown OFF-state di bawah untuk pilih. */
export const STATUS_PEKERJAAN_OPTIONS: Option<StatusPekerjaan>[] = [
  { value: 'bekerja', label: 'Bekerja' },
  { value: 'suri_rumah', label: 'Suri rumah' },
  { value: 'tidak_bekerja', label: 'Tidak bekerja' },
  { value: 'pesara', label: 'Pesara' },
];

/** Dropdown 3-pilihan bila toggle "Sudah Bekerja" OFF — TIDAK termasuk 'bekerja'. */
export const STATUS_PEKERJAAN_TIDAK_BEKERJA_OPTIONS: Option<StatusPekerjaan>[] = [
  { value: 'suri_rumah', label: 'Suri Rumah' },
  { value: 'tidak_bekerja', label: 'Tidak Bekerja' },
  { value: 'pesara', label: 'Pesara' },
];

export const SEKTOR_PEKERJAAN_OPTIONS: Option<SektorPekerjaan>[] = [
  { value: 'kerajaan', label: 'Kerajaan' },
  { value: 'swasta', label: 'Swasta' },
  { value: 'glc', label: 'GLC' },
  { value: 'sendiri', label: 'Sendiri' },
];

export const BIDANG_KERAJAAN_OPTIONS: Option<BidangKerajaan>[] = [
  { value: 'pentadbiran', label: 'Pentadbiran' },
  { value: 'pendidikan', label: 'Pendidikan' },
  { value: 'kesihatan', label: 'Kesihatan' },
  { value: 'kejuruteraan', label: 'Kejuruteraan' },
  { value: 'teknologi_maklumat', label: 'Teknologi Maklumat' },
  { value: 'kewangan', label: 'Kewangan' },
  { value: 'perundangan', label: 'Perundangan' },
  { value: 'keselamatan', label: 'Keselamatan' },
  { value: 'penguatkuasaan', label: 'Penguatkuasaan' },
  { value: 'pertanian_perikanan', label: 'Pertanian & Perikanan' },
  { value: 'sains_penyelidikan', label: 'Sains & Penyelidikan' },
  { value: 'kebajikan_sosial', label: 'Kebajikan & Sosial' },
  { value: 'agama', label: 'Agama' },
  { value: 'media_kebudayaan', label: 'Media & Kebudayaan' },
  { value: 'kemahiran_sokongan', label: 'Kemahiran & Sokongan' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

export const KUMPULAN_BIDANG_SWASTA_OPTIONS: Option<KumpulanBidangSwasta>[] = [
  { value: 'perkhidmatan_perdagangan', label: 'Perkhidmatan & Perdagangan' },
  { value: 'perindustrian_sumber_asli', label: 'Perindustrian & Sumber Asli' },
  { value: 'profesional_pengurusan', label: 'Profesional & Pengurusan' },
  { value: 'kreatif_media', label: 'Kreatif & Media' },
  { value: 'kemahiran_tvet', label: 'Kemahiran & Teknikal/TVET' },
];

/** Pilihan Bidang Khusus mengikut Kumpulan Bidang — 'Lain-lain' di hujung setiap kumpulan. */
export const BIDANG_KHUSUS_SWASTA_OPTIONS: Record<KumpulanBidangSwasta, Option<BidangKhususSwasta>[]> = {
  perkhidmatan_perdagangan: [
    { value: 'peruncitan_perdagangan', label: 'Peruncitan & perdagangan' },
    { value: 'logistik_pengangkutan', label: 'Logistik & pengangkutan' },
    { value: 'pelancongan_hospitaliti', label: 'Pelancongan & hospitaliti' },
    { value: 'makanan_minuman_fnb', label: 'Makanan & minuman (F&B)' },
    { value: 'hartanah', label: 'Hartanah' },
    { value: 'automotif_servis', label: 'Automotif & servis' },
    { value: 'keselamatan', label: 'Keselamatan' },
    { value: 'sukan_kecergasan', label: 'Sukan & kecergasan' },
    { value: 'warga_emas_penjagaan', label: 'Warga emas & penjagaan' },
    { value: 'pendidikan_swasta', label: 'Pendidikan (swasta)' },
    { value: 'kesihatan_swasta', label: 'Kesihatan (swasta)' },
    { value: 'kebajikan_sosial_ngo', label: 'Kebajikan & sosial (swasta/NGO)' },
    { value: 'agama_swasta', label: 'Agama (swasta)' },
    { value: 'penguatkuasaan_swasta', label: 'Penguatkuasaan (swasta)' },
    { value: 'lain_lain', label: 'Lain-lain' },
  ],
  perindustrian_sumber_asli: [
    { value: 'pembuatan', label: 'Pembuatan' },
    { value: 'minyak_gas_tenaga', label: 'Minyak/gas & tenaga' },
    { value: 'perladangan_agrikultur', label: 'Perladangan & agrikultur' },
    { value: 'perikanan_akuakultur', label: 'Perikanan & akuakultur' },
    { value: 'penternakan', label: 'Penternakan' },
    { value: 'perlombongan_kuari', label: 'Perlombongan & kuari' },
    { value: 'ekonomi_hijau_esg', label: 'Ekonomi hijau & ESG' },
    { value: 'lain_lain', label: 'Lain-lain' },
  ],
  profesional_pengurusan: [
    { value: 'perundangan', label: 'Perundangan' },
    { value: 'kejuruteraan', label: 'Kejuruteraan' },
    { value: 'seni_bina_perancangan_bandar', label: 'Seni bina & perancangan bandar' },
    { value: 'sumber_manusia_perundingan', label: 'Sumber manusia & perundingan' },
    { value: 'pemasaran_pengiklanan', label: 'Pemasaran & pengiklanan' },
    { value: 'pentadbiran', label: 'Pentadbiran' },
    { value: 'teknologi_maklumat', label: 'Teknologi Maklumat' },
    { value: 'kewangan', label: 'Kewangan' },
    { value: 'sains_penyelidikan', label: 'Sains & Penyelidikan' },
    { value: 'lain_lain', label: 'Lain-lain' },
  ],
  kreatif_media: [
    { value: 'media_penyiaran', label: 'Media & penyiaran' },
    { value: 'industri_kreatif', label: 'Industri kreatif' },
    { value: 'pencipta_kandungan', label: 'Pencipta kandungan' },
    { value: 'fesyen_kraf', label: 'Fesyen & kraf' },
    { value: 'kebudayaan', label: 'Kebudayaan' },
    { value: 'lain_lain', label: 'Lain-lain' },
  ],
  kemahiran_tvet: [
    { value: 'pertukangan', label: 'Pertukangan' },
    { value: 'kecantikan_dandanan', label: 'Kecantikan & dandanan' },
    { value: 'pembaikan', label: 'Pembaikan' },
    { value: 'penyelenggaraan', label: 'Penyelenggaraan' },
    { value: 'lain_lain', label: 'Lain-lain' },
  ],
};

export const JENIS_KERJA_SENDIRI_OPTIONS: Option<JenisKerjaSendiri>[] = [
  { value: 'pekerja_gig', label: 'Pekerja Gig' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'pencipta_kandungan', label: 'Pencipta Kandungan' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

export const STATUS_PERKAHWINAN_OPTIONS: Option<StatusPerkahwinan>[] = [
  { value: 'bujang', label: 'Bujang' },
  { value: 'berkahwin', label: 'Berkahwin' },
  { value: 'pernah_berkahwin', label: 'Pernah Berkahwin' },
];

export const SEBAB_PERKAHWINAN_OPTIONS: Option<SebabPerkahwinanBerakhir>[] = [
  { value: 'bercerai', label: 'Bercerai' },
  { value: 'kematian_pasangan', label: 'Kematian Pasangan' },
];

export const PENDAPATAN_RANGE_OPTIONS: Option<PendapatanRange>[] = [
  { value: '<1000', label: 'Bawah RM1,000' },
  { value: '1000-2999', label: 'RM1,000 – RM2,999' },
  { value: '3000-4999', label: 'RM3,000 – RM4,999' },
  { value: '5000-9999', label: 'RM5,000 – RM9,999' },
  { value: '10000-14999', label: 'RM10,000 – RM15,000' },
  { value: '15000-19999', label: 'RM15,000 – RM20,000' },
  { value: '20000+', label: 'RM20,000 ke atas' },
];

/**
 * 16 negeri/wilayah persekutuan — ejaan SAMA PERSIS seperti senarai
 * pengesanan negeri daripada teks alamat dalam `member_statistics()`
 * (`20260913000020_member_statistics.sql`), untuk konsisten merentas app.
 */
export const NEGERI_OPTIONS: Option<string>[] = [
  { value: 'Selangor', label: 'Selangor' },
  { value: 'Kuala Lumpur', label: 'Kuala Lumpur' },
  { value: 'Johor', label: 'Johor' },
  { value: 'Perak', label: 'Perak' },
  { value: 'Kedah', label: 'Kedah' },
  { value: 'Pulau Pinang', label: 'Pulau Pinang' },
  { value: 'Pahang', label: 'Pahang' },
  { value: 'Terengganu', label: 'Terengganu' },
  { value: 'Kelantan', label: 'Kelantan' },
  { value: 'Negeri Sembilan', label: 'Negeri Sembilan' },
  { value: 'Melaka', label: 'Melaka' },
  { value: 'Perlis', label: 'Perlis' },
  { value: 'Sabah', label: 'Sabah' },
  { value: 'Sarawak', label: 'Sarawak' },
  { value: 'Putrajaya', label: 'Putrajaya' },
  { value: 'Labuan', label: 'Labuan' },
];

export const BUSINESS_MODE_OPTIONS: Option<BusinessMode>[] = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'kedua_dua', label: 'Kedua-dua' },
];

export const BUSINESS_SUBKATEGORI_ONLINE_OPTIONS: Option<BusinessSubKategori>[] = [
  { value: 'e_dagang', label: 'E-dagang' },
  { value: 'reseller_dropship', label: 'Reseller / Dropship' },
  { value: 'perkhidmatan_digital', label: 'Perkhidmatan Digital' },
  { value: 'affiliate_marketing', label: 'Affiliate Marketing' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

export const BUSINESS_SUBKATEGORI_OFFLINE_OPTIONS: Option<BusinessSubKategori>[] = [
  { value: 'runcit_kedai', label: 'Runcit / Kedai' },
  { value: 'makanan_minuman', label: 'Makanan & Minuman' },
  { value: 'perkhidmatan', label: 'Perkhidmatan' },
  { value: 'pertanian_ternakan', label: 'Pertanian / Ternakan' },
  { value: 'automotif', label: 'Automotif' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

/**
 * Satu baris `member_businesses` — tab Perniagaan. Satu ahli boleh ada
 * BANYAK baris (0..N), diurus tempatan dalam borang sebagai array, bukan
 * medan flat pada `Member`. Lihat `lib/member-businesses.ts`.
 */
export type MemberBusiness = {
  id: string;
  member_id: string;
  mode: BusinessMode;
  sub_kategori: BusinessSubKategori[];
  nama_perniagaan: string | null;
  negeri_operasi: string | null;
  anggaran_pendapatan_range: PendapatanRange | null;
  created_at: string;
  updated_at: string;
};

/** Draf tempatan sebelum disimpan — `id` opsyenal untuk baris baharu (belum ada di DB). */
export type MemberBusinessDraft = Omit<MemberBusiness, 'id' | 'member_id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

/**
 * Kawasan usrah disimpan sebagai kod pendek. Data import asalnya menulis nama
 * penuh dengan kod dalam kurungan ('USRAH PANTAI TIMUR (UPT)'); migration
 * `20260906000006` meringkaskannya kepada kod.
 */
export const KAWASAN_USRAH_OPTIONS: Option<string>[] = [
  { value: 'US', label: 'Usrah Selatan' },
  { value: 'ULK', label: 'Usrah Lembah Klang' },
  { value: 'UU', label: 'Usrah Utara' },
  { value: 'UPT', label: 'Usrah Pantai Timur' },
  { value: 'UT', label: 'Usrah Terengganu' },
  { value: 'UTS', label: 'Usrah Tengah Semenanjung' },
  { value: 'UA-UB', label: 'Usrah Antarabangsa & Borneo' },
];

/** Label penuh bagi kod kawasan usrah; nilai tidak dikenali dipulangkan apa adanya. */
export function kawasanUsrahLabel(kawasan: string): string {
  return KAWASAN_USRAH_OPTIONS.find((option) => option.value === kawasan)?.label ?? kawasan;
}

// =============================================================================
// Kumpulan Usrah Tarbiah (naqib kumpulan, pemantauan) — diminta 2026-10-04.
// Selari dengan `supabase/migrations/20261004000112_kumpulan_usrah.sql`.
// =============================================================================

/** Satu ahli/naqib dalam `kumpulan_usrah_overview()` — `id` ialah id baris pautan (members/naqib), `member_id` ialah id ahli sebenar. */
export type KumpulanUsrahPerson = {
  id: string;
  member_id: string;
  full_name: string;
  generasi: string | null;
};

/** Satu baris `kumpulan_usrah_overview()` — satu kumpulan lengkap dengan ahli & naqib. */
export type KumpulanUsrahOverview = {
  id: string;
  kawasan_usrah: string;
  nama: string;
  created_at: string;
  ahli: KumpulanUsrahPerson[];
  naqib: KumpulanUsrahPerson[];
};

/**
 * Satu baris `schools` — senarai kini DINAMIK, diurus Super Admin (skrin
 * `admin/senarai-sekolah.tsx`), GANTI `SEKOLAH_OPTIONS` tetap lama. Dropdown
 * borang hanya memuatkan baris `aktif = true`.
 */
export type School = {
  id: string;
  nama: string;
  aktif: boolean;
};

/**
 * Satu baris `member_education` — tab Pendidikan, peringkat SELEPAS SPM.
 * Satu ahli boleh ada BANYAK baris (0..N), diurus tempatan dalam borang
 * sebagai array. Lihat `lib/member-education.ts`.
 */
export type MemberEducation = {
  id: string;
  member_id: string;
  peringkat: EducationPeringkat;
  jurusan: string | null;
  institusi: string | null;
  status_pengajian: StatusPengajianEntry;
  /** Hanya bermakna bila `status_pengajian = 'sedang_menjalani'`. */
  sumber_pembiayaan: SumberPembiayaan | null;
  created_at: string;
  updated_at: string;
};

/** Draf tempatan sebelum disimpan — `id` opsyenal untuk baris baharu (belum ada di DB). */
export type MemberEducationDraft = Omit<MemberEducation, 'id' | 'member_id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

/** Tingkatan mad'u Usrah Sekolah — senarai TETAP, 3 pilihan sahaja. */
export const TINGKATAN_OPTIONS: Option<string>[] = [
  { value: 'Tingkatan 3', label: 'Tingkatan 3' },
  { value: 'Tingkatan 4', label: 'Tingkatan 4' },
  { value: 'Tingkatan 5', label: 'Tingkatan 5' },
];

export const JANTINA_OPTIONS: Option<string>[] = [
  { value: 'Muslimin', label: 'Muslimin' },
  { value: 'Muslimat', label: 'Muslimat' },
];

/** Teks paparan untuk satu nilai dropdown; nilai tak dikenali dipulangkan apa adanya. */
export function optionLabel<T extends string>(options: Option<T>[], value: T | null): string {
  if (!value) return '—';
  return options.find((option) => option.value === value)?.label ?? value;
}

/** 'i07' → 'Ikhwan 07'. Digunakan bila senarai generasi belum dimuatkan. */
export function generationLabel(code: string | null): string {
  if (!code) return '—';
  const match = /^i(\d{2})$/.exec(code);
  return match ? 'Ikhwan ' + match[1] : code;
}

// --- Acara berkod QR (usrah bulanan + program am) ----------------------------

/**
 * Jenis acara.
 *
 * Bukan sekadar label: ia menentukan department mana yang memiliki acara itu
 * (LAJNAH TARBIAH atau JABATAN SETIAUSAHA) dan sama ada kehadirannya masuk ke
 * grid dua belas bulan. Lihat `20260907000011_event_types.sql`.
 */
export type EventType = 'usrah' | 'program';

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  usrah: 'Usrah',
  program: 'Program',
};

/** Nama bulan penuh, Januari → Disember. Indeks 0 = Januari. */
export const MONTH_NAMES = [
  'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember',
] as const;

export const MONTH_OPTIONS: Option<string>[] = MONTH_NAMES.map((label, index) => ({
  value: String(index + 1),
  label,
}));

/**
 * Jenis kehadiran acara — peranan geofence, BUKAN bilangan kod QR.
 * 'bersemuka' menolak imbasan dari luar radius; 'hibrid' menerimanya dan
 * melabelnya online.
 */
export type EventMode = 'bersemuka' | 'hibrid';

export const EVENT_MODE_OPTIONS: Option<EventMode>[] = [
  { value: 'bersemuka', label: 'Bersemuka Sahaja' },
  { value: 'hibrid', label: 'Hibrid' },
];

export const EVENT_MODE_LABEL: Record<EventMode, string> = {
  bersemuka: 'Bersemuka Sahaja',
  hibrid: 'Hibrid',
};

/** Satu baris `usrah_events`. */
export type UsrahEvent = {
  id: string;
  name: string;
  event_type: EventType;
  poster_url: string | null;

  /** Kod kawasan (lihat `KAWASAN_USRAH_OPTIONS`) — usrah sahaja. */
  kawasan_usrah: string | null;
  /** Tahun dan bulan yang DIWAKILI oleh sesi usrah — usrah sahaja. */
  year: number | null;
  month: number | null;

  /** 'YYYY-MM-DD'. Acara satu hari mempunyai tarikh mula dan tamat yang sama. */
  start_date: string;
  end_date: string;
  /** 'HH:MM:SS'. */
  start_time: string;
  end_time: string;

  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
  /** Kandungan kod QR — rahsia, jangan papar sebagai teks biasa. */
  qr_token: string;
  valid_until: string;
  is_active: boolean;
  /**
   * Togol kod QR oleh admin. `false` = setiap imbasan ditolak, tanpa mematikan
   * acara itu sendiri. Lihat `20260915000031_single_qr_geofence_label.sql`.
   */
  qr_enabled: boolean;
  /**
   * Peranan geofence pada acara berpin: 'bersemuka' MENGHALANG kehadiran dari
   * luar radius, 'hibrid' hanya MELABELNYA sebagai online. Masih satu kod QR.
   * Lihat `20260915000032_event_mode_geofence.sql`.
   */
  event_mode: EventMode;
  /**
   * Program sahaja: kehadiran turut direkod sebagai kehadiran Usrah bagi bulan
   * tarikh mula program. Lihat `20260915000036_ganti_usrah.sql`.
   */
  ganti_usrah: boolean;
  /** Bulan usrah yang diganti — dipilih admin, wajib bila `ganti_usrah`. Bukan dari start_date. */
  ganti_usrah_year: number | null;
  ganti_usrah_month: number | null;
  /** Ditetapkan bila "Padam" diarkibkan kerana acara ada rekod kehadiran/RSVP. */
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Subfolder Album Gambar dalam Google Drive Shared Drive — dicipta pada muat naik PERTAMA. */
  drive_folder_id: string | null;
};

/**
 * Keadaan program seperti dilihat oleh admin.
 *
 * `tamat` dan `nonaktif` sengaja berasingan: satu ialah masa yang berlalu, satu
 * lagi ialah keputusan admin, dan keduanya perlu kelihatan berbeza pada senarai.
 */
export type UsrahEventStatus = 'aktif' | 'tamat' | 'nonaktif';

export function usrahEventStatus(event: Pick<UsrahEvent, 'is_active' | 'valid_until'>): UsrahEventStatus {
  if (!event.is_active) return 'nonaktif';
  return Date.parse(event.valid_until) > Date.now() ? 'aktif' : 'tamat';
}

export const USRAH_EVENT_STATUS_LABEL: Record<UsrahEventStatus, string> = {
  aktif: 'Aktif',
  tamat: 'Tamat tempoh',
  nonaktif: 'Dimatikan',
};

/** 'HH:MM:SS' atau 'HH:MM' → 'HH:MM'. */
export function timeLabel(value: string): string {
  return value.slice(0, 5);
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export function dateLabel(value: string): string {
  const [year, month, day] = value.split('-');
  return day && month && year ? day + '/' + month + '/' + year : value;
}

/** Julat tarikh; acara satu hari dipapar sebagai satu tarikh, bukan 'X – X'. */
export function dateRangeLabel(start: string, end: string): string {
  return start === end ? dateLabel(start) : dateLabel(start) + ' – ' + dateLabel(end);
}

/** 'Januari' → 'Jan'. Tiga huruf pertama betul untuk kesemua dua belas. */
function shortMonth(month: number): string {
  return MONTH_NAMES[month - 1]?.slice(0, 3) ?? '';
}

/**
 * Julat tarikh sependek yang masih tepat — untuk kad carousel.
 *
 * Bahagian yang dikongsi dua tarikh disebut sekali sahaja: '7 – 9 Sep' dan
 * bukan '7 Sep – 9 Sep'. Tahun hanya muncul apabila ia berbeza daripada tahun
 * semasa, kerana ia hampir selalu sama dan menambah lebar tanpa menambah makna.
 */
export function shortDateRangeLabel(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return dateRangeLabel(start, end);

  const thisYear = new Date().getFullYear();
  const yearSuffix = sy === thisYear && ey === thisYear ? '' : ' ' + ey;

  if (start === end) return sd + ' ' + shortMonth(sm) + (sy === thisYear ? '' : ' ' + sy);
  if (sy === ey && sm === em) return sd + ' – ' + ed + ' ' + shortMonth(sm) + yearSuffix;
  if (sy === ey) return sd + ' ' + shortMonth(sm) + ' – ' + ed + ' ' + shortMonth(em) + yearSuffix;

  return sd + ' ' + shortMonth(sm) + ' ' + sy + ' – ' + ed + ' ' + shortMonth(em) + ' ' + ey;
}

/**
 * 'HH:MM[:SS]' → '8:00 PM'.
 *
 * Nilai disimpan dalam bentuk 24 jam kerana itu yang difahami Postgres; jam 12
 * dengan AM/PM ialah cara ia DIBACA di Malaysia, jadi penukaran itu tinggal di
 * lapisan paparan dan tidak pernah menyentuh apa yang dihantar ke pangkalan
 * data.
 */
export function timeLabel12(value: string): string {
  const [rawHour, rawMinute] = value.split(':');
  const hour = Number(rawHour);
  if (!Number.isFinite(hour)) return value;

  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return display + ':' + (rawMinute ?? '00').slice(0, 2) + ' ' + suffix;
}

/** Julat masa dalam bentuk 12 jam; masa yang sama dipapar sekali sahaja. */
export function timeRangeLabel(start: string, end: string): string {
  const from = timeLabel12(start);
  const to = timeLabel12(end);
  return from === to ? from : from + ' – ' + to;
}

/**
 * '8:00 PM' / '8 pm' / '20:00' → 'HH:MM', atau `null` bila tidak difahami.
 *
 * Cabang web sahaja yang memerlukannya (peranti menggunakan pemilih sistem),
 * tetapi ia longgar dengan sengaja: seseorang yang menaip masa dalam borang
 * tidak patut ditolak kerana meninggalkan satu sifar di hadapan.
 */
export function parseTime12(input: string): string | null {
  const match = /^\s*(\d{1,2})\s*[:.]?\s*(\d{2})?\s*([AaPp])?\.?[Mm]?\.?\s*$/.exec(input);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridiem = match[3]?.toLowerCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;

  if (meridiem === 'a') {
    if (hour < 1 || hour > 12) return null;
    hour = hour === 12 ? 0 : hour;
  } else if (meridiem === 'p') {
    if (hour < 1 || hour > 12) return null;
    hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }

  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

/**
 * Nama sesi usrah bulanan — dijana, bukan ditaip.
 *
 * Nama usrah ialah gabungan kawasan, bulan dan tahun, dan ketiga-tiganya sudah
 * disimpan sebagai kolum tersendiri. Membiarkan admin menaipnya bermakna nama
 * dan kolum boleh bercanggah, dan nama itulah yang dilihat ahli.
 */
export function usrahEventName(kawasan: string | null, month: number | null, year: number | null): string {
  const kawasanLabel = kawasan ? optionLabel(KAWASAN_USRAH_OPTIONS, kawasan) : 'Usrah';
  const monthLabel = month && month >= 1 && month <= 12 ? MONTH_NAMES[month - 1] : '';
  return [kawasanLabel, [monthLabel, year].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
}

// --- Direktori acara & pengumuman (skrin Utama) ------------------------------

/**
 * Acara seperti dilihat oleh AHLI, melalui `event_upcoming_directory()`.
 *
 * Sengaja bukan `Pick<UsrahEvent, ...>`: bentuk ini ditakrifkan oleh senarai
 * kolum dalam fungsi `security definer` itu, dan menyambungkannya kepada baris
 * penuh akan menjadikan penambahan kolum sensitif pada `usrah_events` kelihatan
 * seolah-olah ia turut terdedah di sini.
 */
export type UpcomingEvent = {
  id: string;
  event_type: EventType;
  name: string;
  poster_url: string | null;
  /**
   * Kandungan kod QR kehadiran, dipapar kepada ahli supaya boleh disimpan dan
   * diimbas dari galeri. Halangan kehadiran jarak jauh ialah geofence dan
   * tetingkap masa — lihat `20260913000025_event_qr_for_members.sql`.
   */
  qr_token: string;
  /** Akhir tetingkap kehadiran — butang RSVP ahli dipapar hanya sebelum masa ini. */
  valid_until: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  location_text: string | null;
};

/**
 * Satu baris `event_directory_all()` — SEMUA acara (lampau + semasa + akan
 * datang), bukan setakat `UpcomingEvent` yang tertapis `end_date >=
 * current_date`. `is_upcoming` mengulang syarat tapisan SAMA itu (dikira di
 * pelayan, bukan di JS, supaya tiada risiko longgar zon waktu) — skrin ahli
 * (event-info.tsx) guna ia untuk sekat butang Album pada acara tamat.
 */
export type EventDirectoryRow = UpcomingEvent & {
  /** Pin lokasi (untuk butang Navigasi); NULL bila admin tidak meletakkan pin. */
  latitude: number | null;
  longitude: number | null;
  is_upcoming: boolean;
  photo_count: number;
};

/** Satu baris `announcements`. */
export type Announcement = {
  id: string;
  title: string;
  description: string | null;
  poster_url: string;
  is_active: boolean;

  /**
   * Tetingkap paparan, 'YYYY-MM-DD'. Tarikh sahaja, tanpa masa — pengumuman
   * ialah perkara sepanjang hari, dan menambah jam bermakna admin perlu
   * memutuskan sesuatu yang dia tidak pernah fikirkan.
   *
   * `null` bermakna tiada had pada hujung itu: mula NULL = papar serta-merta,
   * tamat NULL = tiada tarikh tamat.
   */
  start_date: string | null;
  end_date: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Satu jenis pembayaran/infaq di luar yuran dan PIPIS.
 *
 * TIADA amaun dan TIADA lejar. Wang masuk terus ke akaun bank melalui kod QR
 * DuitNow, dan aplikasi ini tidak pernah melihat transaksinya — jadi merekod
 * "siapa sudah bayar" di sini bermakna mencipta senarai yang tiada sesiapa
 * boleh pastikan ketepatannya.
 */
export type AdhocPaymentType = {
  id: string;
  title: string;
  description: string | null;

  /**
   * Kod QR DuitNow, atau `null` selagi belum disediakan.
   *
   * Boleh kosong tidak seperti `poster_url` pengumuman: bendahari selalunya
   * mengumumkan tabung dahulu dan menyediakan kod QR beberapa hari kemudian.
   */
  qr_image_url: string | null;

  is_active: boolean;

  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// =============================================================================
// Usrah Sekolah (Naqib/Naqibah) — LAJNAH PERKADERAN
// Selari dengan `supabase/migrations/20260922000050_sekolah_usrah.sql`.
// =============================================================================

/** Satu lantikan naqib — `is_active=false` ialah SEJARAH, bukan dibuang. */
export type NaqibAssignment = {
  id: string;
  member_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
};

/** Hasil `perkaderan_naqib_list()` — naqib aktif digabung dengan nama ahlinya. */
export type NaqibAssignmentWithMember = {
  id: string;
  member_id: string;
  member_full_name: string;
  member_generasi: string | null;
  assigned_at: string;
  is_active: boolean;
};

export type UsrahGroup = {
  id: string;
  naqib_member_id: string;
  sekolah: string;
  /** Dijana automatik oleh trigger DB — bukan diedit terus. */
  group_name: string;
  /** Cadangan sahaja — pra-isi borang sesi baharu. Tidak menjejaskan sesi sedia ada. */
  default_partner_naqib_member_id: string | null;
  /** `false` = diarkibkan (ada sejarah sesi, tidak boleh dipadam terus) — tidak muncul dalam senarai aktif. */
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UsrahMadU = {
  id: string;
  group_id: string;
  nama: string;
  tingkatan: string | null;
  /** Soft-remove sahaja — JANGAN hard delete (RLS pun tidak membenarkannya). */
  is_active: boolean;
  added_at: string;
};

export type UsrahSession = {
  id: string;
  group_id: string;
  session_date: string;
  location_text: string | null;
  topik: string | null;
  /** Untuk SESI INI sahaja — menukarnya tidak menjejaskan kumpulan atau sesi lain. */
  partner_naqib_member_id: string | null;
  partner_naqib_hadir: boolean;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Satu baris kehadiran = HADIR. Tiada baris = tidak hadir. */
export type UsrahAttendanceRow = {
  id: string;
  session_id: string;
  mad_u_id: string;
};

/** Hasil `perkaderan_export()` — dua helaian laporan .xlsx. */
export type PerkaderanExportRow = {
  kumpulan: string;
  naqib: string;
  sekolah: string;
  /** 'Aktif' atau 'Diarkib' (`sekolah_usrah_groups.is_active`). */
  status_kumpulan?: string;
  tarikh: string;
  lokasi: string | null;
  topik: string | null;
  bilangan_hadir: number;
  partner_naqib: string | null;
  /** `null` bila tiada partner untuk sesi ini — berbeza daripada `false` (partner ada, tak hadir). */
  partner_hadir: boolean | null;
};

export type PerkaderanExportDetailRow = {
  kumpulan: string;
  status_kumpulan?: string;
  nama_mad_u: string;
  /** 'Aktif' atau 'Tidak Aktif' (`sekolah_usrah_mad_u.is_active`). */
  status_mad_u?: string;
  tingkatan: string | null;
  tarikh_sesi: string;
  hadir: boolean;
  partner_naqib: string | null;
  /** `null` bila tiada partner untuk sesi ini — berbeza daripada `false` (partner ada, tak hadir). */
  partner_hadir: boolean | null;
};

export type PerkaderanExport = {
  ringkasan_sesi: PerkaderanExportRow[];
  kehadiran_terperinci: PerkaderanExportDetailRow[];
};

/** Hasil `perkaderan_naqib_overview()` — PERINGKAT 1 navigasi admin. */
export type NaqibOverview = {
  member_id: string;
  full_name: string;
  generasi: string | null;
  sekolah_list: string;
  group_count: number;
  session_count: number;
};

/** Hasil `perkaderan_naqib_sessions()` — PERINGKAT 2 navigasi admin (semua sesi satu naqib). */
export type NaqibSessionRow = {
  session_id: string;
  group_id: string;
  session_date: string;
  location_text: string | null;
  sekolah: string;
  group_name: string;
};

/** Satu sesi lampau naqib sendiri, merentasi SEMUA kumpulannya — untuk seksyen Hub. */
export type MySessionRow = {
  id: string;
  group_id: string;
  session_date: string;
  location_text: string | null;
  topik: string | null;
  sekolah: string;
  partner_naqib_member_id: string | null;
  partner_naqib_hadir: boolean;
};

/** Butiran PENUH satu sesi, paparan VIEW-ONLY untuk naqib (tiada checkbox boleh sunting). */
export type SessionViewDetail = {
  session: UsrahSession;
  sekolah: string;
  attendees: { nama: string; tingkatan: string | null }[];
};

// -----------------------------------------------------------------------------
// Kesihatan (`member_health_issues`) — DATA SENSITIF, RLS ketat
// (`can_view_health`/`can_edit_health`). Lihat `lib/member-health.ts`.
// -----------------------------------------------------------------------------

export type JenisMasalahKesihatan =
  | 'fizikal'
  | 'mental'
  | 'emosi'
  | 'penyakit_kronik'
  | 'oku'
  | 'deria'
  | 'pertuturan_komunikasi'
  | 'pembelajaran'
  | 'tidur'
  | 'pemakanan'
  | 'ketagihan'
  | 'tiada'
  | 'lain_lain'
  | 'tidak_mahu_nyatakan';

export const JENIS_MASALAH_KESIHATAN_OPTIONS: Option<JenisMasalahKesihatan>[] = [
  { value: 'fizikal', label: 'Fizikal' },
  { value: 'mental', label: 'Mental' },
  { value: 'emosi', label: 'Emosi' },
  { value: 'penyakit_kronik', label: 'Penyakit kronik' },
  { value: 'oku', label: 'Ketidakupayaan / OKU' },
  { value: 'deria', label: 'Deria (penglihatan, pendengaran)' },
  { value: 'pertuturan_komunikasi', label: 'Pertuturan & komunikasi' },
  { value: 'pembelajaran', label: 'Pembelajaran (contoh: disleksia)' },
  { value: 'tidur', label: 'Tidur' },
  { value: 'pemakanan', label: 'Pemakanan' },
  { value: 'ketagihan', label: 'Ketagihan' },
  { value: 'tiada', label: 'Tiada' },
  { value: 'lain_lain', label: 'Lain-lain (nyatakan)' },
  { value: 'tidak_mahu_nyatakan', label: 'Tidak mahu nyatakan' },
];

export type MemberHealthIssue = {
  id: string;
  member_id: string;
  jenis_masalah: JenisMasalahKesihatan;
  nama_penyakit: string | null;
  /** true = Ya, false = Tidak, null = belum dijawab. */
  ada_temujanji_hospital: boolean | null;
  /** Hanya bermakna bila `jenis_masalah = 'lain_lain'`. */
  keterangan_lain: string | null;
  created_at: string;
  updated_at: string;
};

export type MemberHealthIssueDraft = Omit<MemberHealthIssue, 'id' | 'member_id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

/** Hasil `get_rais_lajnah_kebajikan()` — kosong jika jawatan tiada pemegang. */
export type RaisLajnahKebajikan = { nama: string; no_tel: string | null };
