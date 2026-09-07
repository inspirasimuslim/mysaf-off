/**
 * Bentuk baris table Supabase yang digunakan oleh app.
 * Selari dengan `supabase/migrations/20260906000001_roles_permissions.sql`.
 */

export type UserRole = 'super_admin' | 'admin' | 'ahli';

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

export type StatusPengajian = 'tidak_belajar' | 'sedang_belajar' | 'sudah_tamat';

export type StatusPekerjaan =
  | 'bekerja'
  | 'berniaga_usahawan'
  | 'suri_rumah'
  | 'belajar_sepenuh_masa'
  | 'bekerja_dan_belajar'
  | 'pesara'
  | 'tidak_bekerja';

export type StatusPerkahwinan = 'bujang' | 'berkahwin_mbm' | 'berkahwin_bukan_mbm';

export type PendapatanRange = '<1000' | '1000-2999' | '3000-4999' | '5000-9999' | '10000+';

export type Member = {
  id: string;

  // --- Identiti ---
  nombor_ahli: string | null;
  generasi: string | null;
  full_name: string;
  jantina: string | null;
  nric: string | null;
  email: string | null;
  no_tel: string | null;
  alamat: string | null;
  alamat_semasa: string | null;
  kawasan_usrah: string | null;
  avatar_url: string | null;
  disekat: boolean;

  // --- Jawatan ---
  jawatan_ikhwan_1: string | null;
  jawatan_ikhwan_2: string | null;
  jawatan_ikhwan_3: string | null;
  jawatan_pas_1: string | null;
  jawatan_pas_2: string | null;
  jawatan_pas_3: string | null;
  no_keahlian_pas: string | null;

  // --- Pendidikan ---
  tahap_pendidikan: string | null;
  status_pengajian: StatusPengajian | null;
  sekolah: string | null;
  nama_institusi: string | null;
  alamat_institusi: string | null;
  tahun_pengajian: string | null;
  jurusan_pengajian: string | null;
  sumber_pembiayaan: string | null;
  pembiayaan_lain: string | null;

  // --- Pekerjaan ---
  status_pekerjaan: StatusPekerjaan | null;
  sektor_pekerjaan: string | null;
  jawatan_pekerjaan: string | null;
  nama_majikan: string | null;
  alamat_tempat_kerja: string | null;
  anggaran_pendapatan_range: PendapatanRange | null;
  jenis_perniagaan: string | null;

  // --- Keluarga ---
  status_perkahwinan: StatusPerkahwinan | null;
  nama_pasangan: string | null;
  tahun_berkahwin: string | null;
  bil_anak: number | null;
  anggaran_pendapatan_isi_rumah_range: PendapatanRange | null;
  bil_tanggungan_selain_keluarga: number | null;
  pekerjaan_ibu: string | null;
  pekerjaan_bapa: string | null;
  bil_tanggungan_ibu_bapa: number | null;

  // --- Pautan akaun ---
  user_id: string | null;
};

/** Bentuk baris untuk skrin senarai — kolum berat tidak dibaca. */
export type MemberSummary = Pick<
  Member,
  'id' | 'nombor_ahli' | 'generasi' | 'full_name' | 'email' | 'disekat'
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
};

/**
 * Label ringkas untuk direktori — lebih pendek daripada label borang, kerana
 * ia dibaca sekilas pada kad dan bukan dipilih dari dropdown.
 */
const DIRECTORY_PEKERJAAN_LABEL: Record<StatusPekerjaan, string> = {
  bekerja: 'Bekerja',
  berniaga_usahawan: 'Berniaga',
  suri_rumah: 'Suri Rumah',
  belajar_sepenuh_masa: 'Belajar',
  bekerja_dan_belajar: 'Bekerja & Belajar',
  pesara: 'Pesara',
  tidak_bekerja: 'Tidak Bekerja',
};

export function directoryPekerjaanLabel(value: StatusPekerjaan | null): string {
  return value ? DIRECTORY_PEKERJAAN_LABEL[value] : '—';
}

/** Direktori tidak membezakan MBM / bukan MBM — itu butiran dalaman rekod. */
export function directoryPerkahwinanLabel(value: StatusPerkahwinan | null): string {
  if (!value) return '—';
  return value === 'bujang' ? 'Bujang' : 'Berkahwin';
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

export const STATUS_PENGAJIAN_OPTIONS: Option<StatusPengajian>[] = [
  { value: 'tidak_belajar', label: 'Tidak belajar' },
  { value: 'sedang_belajar', label: 'Sedang belajar' },
  { value: 'sudah_tamat', label: 'Sudah tamat pengajian' },
];

export const STATUS_PEKERJAAN_OPTIONS: Option<StatusPekerjaan>[] = [
  { value: 'bekerja', label: 'Bekerja' },
  { value: 'berniaga_usahawan', label: 'Berniaga / Usahawan' },
  { value: 'suri_rumah', label: 'Suri rumah' },
  { value: 'belajar_sepenuh_masa', label: 'Belajar sepenuh masa' },
  { value: 'bekerja_dan_belajar', label: 'Bekerja & belajar' },
  { value: 'pesara', label: 'Pesara' },
  { value: 'tidak_bekerja', label: 'Tidak bekerja' },
];

export const STATUS_PERKAHWINAN_OPTIONS: Option<StatusPerkahwinan>[] = [
  { value: 'bujang', label: 'Bujang' },
  { value: 'berkahwin_mbm', label: 'Berkahwin (MBM)' },
  { value: 'berkahwin_bukan_mbm', label: 'Berkahwin (bukan MBM)' },
];

export const PENDAPATAN_RANGE_OPTIONS: Option<PendapatanRange>[] = [
  { value: '<1000', label: 'Bawah RM1,000' },
  { value: '1000-2999', label: 'RM1,000 – RM2,999' },
  { value: '3000-4999', label: 'RM3,000 – RM4,999' },
  { value: '5000-9999', label: 'RM5,000 – RM9,999' },
  { value: '10000+', label: 'RM10,000 ke atas' },
];

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
  { value: 'UB', label: 'Usrah Borneo' },
  { value: 'UA', label: 'Usrah Antarabangsa' },
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

export const EVENT_TYPE_OPTIONS: Option<EventType>[] = [
  { value: 'usrah', label: 'Usrah' },
  { value: 'program', label: 'Program' },
];

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
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
