import { errorCode, toMalayError } from './errors';
import { readJpegBytes } from './image-upload';
import { supabase } from './supabase';

/**
 * Permohonan Bantuan Zakat (one-off) — migration 148.
 *
 * Dua borang satu halaman: `belajar` dan `bekerja` (Bekerja/Berkahwin). SEMUA tulisan
 * melalui RPC (`bantuan_*`); `authenticated` hanya ada SELECT pada table. Status,
 * jumlah diluluskan dan identiti pelulus ditetapkan oleh pelayan. Nota dalaman
 * berada dalam table berasingan yang ahli tidak boleh baca, jadi kod ini tidak
 * menapis medan sulit di sebelah klien.
 *
 * Admin yang mengurus permohonan = department khusus `TABUNG ZAKAT`
 * (`ZAKAT_DEPARTMENT` dalam `lib/department-access.ts`), BUKAN LAJNAH KEBAJIKAN.
 *
 * Kelulusan BUKAN pembayaran: modul ini tidak merekod bayaran dan tidak boleh
 * memaparkan "Dibayar" atau menjanjikan tarikh bayaran.
 */

// --- Jenis -------------------------------------------------------------------

export type BantuanStatus = 'draft' | 'submitted' | 'under_review' | 'needs_information' | 'approved' | 'rejected';
export type BantuanKategori = 'belajar' | 'bekerja';

export type BantuanApplication = {
  id: string;
  no_rujukan: string | null;
  member_id: string;
  status: BantuanStatus;
  versi: number;
  kategori: BantuanKategori;
  nama_pemohon: string | null;
  telefon: string | null;
  generasi: string | null;
  status_diri: 'bujang' | 'berkahwin' | 'lain_lain' | null;
  status_diri_lain: string | null;
  tempat_menetap: string | null;
  tahap_pendidikan: string | null;
  tahap_pendidikan_lain: string | null;
  tinggal_di: string | null;
  tinggal_di_lain: string | null;
  tahun_pengajian: string | null;
  pembiayaan: string[] | null;
  pembiayaan_lain: string | null;
  pekerjaan: string | null;
  pendapatan_pemohon: number | null;
  pendapatan_keluarga: number | null;
  pekerjaan_ibu: string | null;
  pekerjaan_bapa: string | null;
  bil_tanggungan: number | null;
  anak_ke: number | null;
  bil_adik_beradik: number | null;
  bil_anak: number | null;
  sebab_keperluan: string[] | null;
  sebab_lain: string | null;
  penerangan: string | null;
  pernah_terima: boolean | null;
  qr_path: string | null;
  qr_dihantar_at: string | null;
  pengakuan_setuju: boolean;
  pertama_dihantar_at: string | null;
  dihantar_at: string | null;
  jumlah_diluluskan: number | null;
  mesej_keputusan: string | null;
  sebab_tolak_kategori: string | null;
  sebab_tolak_penjelasan: string | null;
  diputuskan_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Medan borang yang boleh dihantar kepada `bantuan_save_draft` (nombor dihantar sebagai teks). */
export type BantuanForm = {
  kategori?: BantuanKategori;
  nama_pemohon?: string;
  telefon?: string;
  generasi?: string;
  status_diri?: string;
  status_diri_lain?: string;
  tempat_menetap?: string;
  tahap_pendidikan?: string;
  tahap_pendidikan_lain?: string;
  tinggal_di?: string;
  tinggal_di_lain?: string;
  tahun_pengajian?: string;
  pembiayaan?: string[];
  pembiayaan_lain?: string;
  pekerjaan?: string;
  pendapatan_pemohon?: string;
  pendapatan_keluarga?: string;
  pekerjaan_ibu?: string;
  pekerjaan_bapa?: string;
  bil_tanggungan?: string;
  anak_ke?: string;
  bil_adik_beradik?: string;
  bil_anak?: string;
  sebab_keperluan?: string[];
  sebab_lain?: string;
  penerangan?: string;
  pernah_terima?: boolean | null;
  pengakuan_setuju?: boolean;
};

export type BantuanInfoRequest = {
  id: string;
  application_id: string;
  mesej: string;
  created_at: string;
  respons: string | null;
  responded_at: string | null;
};

export type BantuanHistory = {
  id: string;
  application_id: string;
  actor_nama: string | null;
  tindakan: string;
  status_dari: string | null;
  status_ke: string | null;
  alasan: string | null;
  perubahan: Record<string, { dari: unknown; kepada: unknown }> | null;
  terlihat_ahli: boolean;
  created_at: string;
};

export type BantuanNote = {
  id: string;
  application_id: string;
  penulis_nama: string | null;
  jenis: 'nota' | 'alasan_kelulusan' | 'alasan_penolakan';
  isi: string;
  created_at: string;
};

export type BantuanAdminRow = {
  id: string;
  no_rujukan: string | null;
  nama_pemohon: string | null;
  generasi: string | null;
  kategori: BantuanKategori;
  status: BantuanStatus;
  pendapatan_keluarga: number | null;
  jumlah_diluluskan: number | null;
  dihantar_at: string | null;
  dihantar_semula: boolean;
  pertindihan: boolean;
  versi: number;
};

export type BantuanPrevious = {
  id: string;
  no_rujukan: string | null;
  kategori: BantuanKategori;
  sebab_keperluan: string[] | null;
  status: BantuanStatus;
  jumlah_diluluskan: number | null;
  dihantar_at: string | null;
};

// --- Label -------------------------------------------------------------------

export type Option<T extends string = string> = { value: T; label: string };

export const STATUS_LABEL: Record<BantuanStatus, string> = {
  draft: 'Draf',
  submitted: 'Dihantar',
  under_review: 'Dalam Semakan',
  needs_information: 'Perlu Maklumat Tambahan',
  approved: 'Diluluskan',
  rejected: 'Tidak Diluluskan',
};

export const STATUS_TONE: Record<BantuanStatus, 'neutral' | 'info' | 'warn' | 'positive' | 'negative'> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'info',
  needs_information: 'warn',
  approved: 'positive',
  rejected: 'negative',
};

export const KATEGORI_LABEL: Record<BantuanKategori, string> = {
  belajar: 'Belajar',
  bekerja: 'Bekerja / Berkahwin',
};

export const KATEGORI_PENERANGAN: Record<BantuanKategori, string> = {
  belajar: 'Untuk ahli yang sedang menuntut (STPM, matrikulasi, diploma, ijazah dan seterusnya).',
  bekerja: 'Untuk ahli yang sudah bekerja atau berkahwin dan memerlukan bantuan zakat.',
};

/** Tajuk borang, contoh: "PERMOHONAN TABUNG ZAKAT IKHWAN 2026 (BELAJAR)". */
export function tajukBorang(kategori: BantuanKategori, tahun: number = new Date().getFullYear()): string {
  return 'PERMOHONAN TABUNG ZAKAT IKHWAN ' + tahun + ' (' + (kategori === 'belajar' ? 'BELAJAR' : 'BEKERJA/BERKAHWIN') + ')';
}

export const STATUS_DIRI_OPTIONS: Option[] = [
  { value: 'bujang', label: 'Bujang' },
  { value: 'berkahwin', label: 'Berkahwin' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

export const TAHAP_PENDIDIKAN_BELAJAR: Option[] = [
  { value: 'stpm', label: 'STPM' },
  { value: 'stam', label: 'STAM' },
  { value: 'matrikulasi', label: 'Matrikulasi' },
  { value: 'asasi', label: 'Asasi' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'sarjana_muda', label: 'Sarjana Muda' },
  { value: 'sarjana', label: 'Sarjana' },
  { value: 'phd', label: 'Doktor Falsafah (PhD)' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

/** Borang Bekerja: hanya jika bekerja sambil belajar. */
export const TAHAP_PENDIDIKAN_BEKERJA: Option[] = TAHAP_PENDIDIKAN_BELAJAR.filter((option) =>
  ['diploma', 'sarjana_muda', 'sarjana', 'phd'].includes(option.value),
);

export const TINGGAL_DI_OPTIONS: Option[] = [
  { value: 'kolej', label: 'Kolej Kediaman Universiti' },
  { value: 'rumah_sewa', label: 'Rumah Sewa' },
  { value: 'keluarga', label: 'Kediaman Keluarga (bersama ibu bapa)' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

export const PEMBIAYAAN_OPTIONS: Option[] = [
  { value: 'biasiswa', label: 'Biasiswa' },
  { value: 'pinjaman', label: 'Pinjaman' },
  { value: 'ibu_bapa', label: 'Ibu bapa' },
  { value: 'kerja_separuh_masa', label: 'Bekerja part time sambil belajar' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

export const SEBAB_OPTIONS: Option[] = [
  { value: 'sara_hidup', label: 'Sara hidup' },
  { value: 'perubatan', label: 'Perubatan' },
  { value: 'pendidikan', label: 'Pendidikan' },
  { value: 'tempat_tinggal', label: 'Tempat tinggal' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

export const PENGAKUAN_TEKS =
  'Saya mengaku bahawa semua maklumat yang diberikan adalah benar. Lajnah Kebajikan (LK) berhak membatalkan dan menarik balik bantuan zakat sekiranya saya memberikan maklumat palsu.';

export const MAKLUMAT_PENTING: string[] = [
  'Pemohon mestilah ahli Ikhwan yang layak dan memerlukan bantuan zakat.',
  'Semua maklumat adalah sulit dan hanya boleh dicapai oleh jawatankuasa zakat daripada Lajnah Kebajikan (LK).',
];

export type KenalanLK = { nama: string; generasi: string; telefon: string };

/** Kenalan LK pada skrin selepas hantar. Muslimat sama untuk kedua-dua borang. */
const MUSLIMAT: KenalanLK[] = [
  { nama: 'Izzah Atirah', generasi: 'i16', telefon: '0139362972' },
  { nama: 'Ili Syafaf Amani', generasi: 'i15', telefon: '0194046523' },
];

export const KENALAN_LK: Record<BantuanKategori, { muslimin: KenalanLK[]; muslimat: KenalanLK[] }> = {
  belajar: { muslimin: [{ nama: 'Syamsul Irham', generasi: 'i17', telefon: '01111717713' }], muslimat: MUSLIMAT },
  bekerja: { muslimin: [{ nama: 'Zulkifli Che Noh', generasi: 'i07', telefon: '01115057114' }], muslimat: MUSLIMAT },
};

export const MESEJ_SELEPAS_HANTAR =
  'Pihak LK akan menyemak permohonan anda dan menghubungi anda dalam tempoh 7 hingga 14 hari bekerja dari tarikh permohonan jika diterima. Jika diluluskan, anda akan diminta menghantar gambar kod QR (DuitNow) untuk penerimaan bantuan.';

/** Pautan WhatsApp daripada nombor tempatan Malaysia (0123… → 60123…). */
export function waLink(telefon: string): string {
  const digits = telefon.replace(/\D/g, '');
  const intl = digits.startsWith('0') ? '6' + digits : digits;
  return 'https://wa.me/' + intl;
}

export function optionLabel(options: Option[], value: string | null | undefined, lain?: string | null): string {
  if (!value) return '—';
  const label = options.find((option) => option.value === value)?.label ?? value;
  return value === 'lain_lain' && lain ? label + ': ' + lain : label;
}

export function optionLabels(options: Option[], values: string[] | null | undefined, lain?: string | null): string {
  if (!values || values.length === 0) return '—';
  return values.map((value) => optionLabel(options, value, lain)).join(', ');
}

export const TOLAK_OPTIONS: Option[] = [
  { value: 'luar_skop', label: 'Keperluan tidak menepati skop bantuan' },
  { value: 'tidak_dapat_disahkan', label: 'Maklumat belum dapat disahkan selepas semakan' },
  { value: 'telah_ditampung', label: 'Keperluan sama telah ditampung sepenuhnya' },
  { value: 'lain_lain', label: 'Lain-lain (dengan penjelasan)' },
];

export const TINDAKAN_LABEL: Record<string, string> = {
  dihantar: 'Permohonan dihantar',
  dihantar_semula: 'Maklumat tambahan dihantar semula',
  mula_semakan: 'Semakan dimulakan',
  minta_maklumat: 'Maklumat tambahan diminta',
  diluluskan: 'Permohonan diluluskan',
  ditolak: 'Permohonan tidak diluluskan',
  qr_dihantar: 'Kod QR penerimaan dihantar',
  nota: 'Nota dalaman ditambah',
  pindaan: 'Perubahan semasa hantar semula',
};

// --- Paparan -----------------------------------------------------------------

export function formatRM(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const [whole, cents] = Number(value).toFixed(2).split('.');
  return 'RM' + whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (cents === '00' ? '' : '.' + cents);
}

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

export function formatTarikh(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

/** Mesej kejayaan untuk ahli bila diluluskan. Sengaja TIDAK menyebut bayaran atau tarikh bayar. */
export const MESEJ_DILULUSKAN =
  'Permohonan anda telah diluluskan. Sila hantar gambar kod QR (DuitNow) akaun anda di bawah supaya pihak Lajnah Kebajikan boleh menguruskan penyerahan bantuan.';

/** Ralat RPC `bantuan_*` sudah dalam Bahasa Melayu — papar terus; selainnya terjemah biasa. */
export function bantuanError(error: unknown, fallback: string): string {
  const code = errorCode(error);
  if (code && ['P0001', '22023', '42501', 'P0002', '40001', '55000'].includes(code)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  if (code === '23514') return 'Ada maklumat yang tidak sah. Sila semak semula medan yang diisi.';
  return toMalayError(error, fallback);
}

/** UUID v4 — kegunaannya hanya untuk keunikan (idempotensi draf), bukan rahsia. */
export function newId(): string {
  const bytes = new Uint8Array(16);
  const cryptoObj = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

// --- Ahli ---------------------------------------------------------------------

/** Penapis `member_id` WAJIB: admin Kebajikan juga lulus RLS untuk permohonan orang lain. */
export async function fetchMyBantuan(memberId: string): Promise<BantuanApplication[]> {
  const { data, error } = await supabase
    .from('bantuan_applications')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as BantuanApplication[] | null) ?? [];
}

export async function fetchBantuan(id: string): Promise<BantuanApplication | null> {
  const { data, error } = await supabase.from('bantuan_applications').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as BantuanApplication | null) ?? null;
}

export type BantuanNotifikasi = {
  id: string;
  no_rujukan: string | null;
  status: 'needs_information' | 'approved' | 'rejected';
  waktu: string;
};

/** Notifikasi ahli: perlu maklumat tambahan, atau keputusan (lulus/tolak) yang belum dilihat. */
export async function fetchBantuanNotifikasi(): Promise<BantuanNotifikasi[]> {
  const { data, error } = await supabase.rpc('bantuan_notifikasi_ahli');
  if (error) throw error;
  return (data as BantuanNotifikasi[] | null) ?? [];
}

/** Tandakan keputusan sudah dilihat (dipanggil bila ahli membuka butiran permohonan). */
export async function markBantuanSeen(id: string): Promise<void> {
  const { error } = await supabase.rpc('bantuan_tandakan_dilihat', { p_id: id });
  if (error) throw error;
}

export async function fetchBantuanPerluTindakan(): Promise<number> {
  const { data, error } = await supabase.rpc('bantuan_perlu_tindakan');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function saveBantuanDraft(id: string, form: BantuanForm): Promise<BantuanApplication> {
  const { data, error } = await supabase.rpc('bantuan_save_draft', { p_id: id, p_data: form });
  if (error) throw error;
  return data as BantuanApplication;
}

export async function submitBantuan(id: string, respons?: string): Promise<BantuanApplication> {
  const { data, error } = await supabase.rpc('bantuan_submit', { p_id: id, p_respons: respons ?? null });
  if (error) throw error;
  return data as BantuanApplication;
}

export async function saveBantuanResponse(id: string, respons: string): Promise<void> {
  const { error } = await supabase.rpc('bantuan_save_response', { p_id: id, p_respons: respons });
  if (error) throw error;
}

export async function fetchBantuanInfoRequests(applicationId: string): Promise<BantuanInfoRequest[]> {
  const { data, error } = await supabase
    .from('bantuan_info_requests')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as BantuanInfoRequest[] | null) ?? [];
}

export async function fetchBantuanHistory(applicationId: string): Promise<BantuanHistory[]> {
  const { data, error } = await supabase
    .from('bantuan_history')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as BantuanHistory[] | null) ?? [];
}

// --- Kod QR penerimaan (selepas diluluskan) --------------------------------------

const QR_BUCKET = 'bantuan-qr';
const QR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Muat naik gambar kod QR (DuitNow) selepas permohonan diluluskan. Gambar dimampatkan
 * kepada JPEG (had 2 MB juga dikuatkuasakan Storage dan `bantuan_set_qr`). Jika
 * pendaftaran gagal, objek baharu dibuang; jika berjaya, QR lama dibuang (cuba-terbaik).
 */
export async function uploadBantuanQr(applicationId: string, imageUri: string): Promise<void> {
  const bytes = await readJpegBytes(imageUri, 1400);
  if (bytes.length === 0) throw new Error('Gambar kosong.');
  if (bytes.length > QR_MAX_BYTES) throw new Error('Saiz gambar melebihi 2 MB.');

  const path = applicationId + '/' + newId() + '.jpg';
  const upload = await supabase.storage.from(QR_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase.rpc('bantuan_set_qr', { p_app: applicationId, p_path: path });
  if (error) {
    void supabase.storage.from(QR_BUCKET).remove([path]);
    throw error;
  }
  if (typeof data === 'string' && data) void supabase.storage.from(QR_BUCKET).remove([data]);
}

/** URL bertandatangan sementara (5 minit) — gambar kekal persendirian. */
export async function bantuanQrUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(QR_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error ?? new Error('Gambar QR tidak dapat dibuka.');
  return data.signedUrl;
}

// --- Admin --------------------------------------------------------------------

export type BantuanFilter = {
  cari?: string;
  kategori?: BantuanKategori | null;
  status?: BantuanStatus | null;
  dari?: string | null;
  hingga?: string | null;
};

export async function fetchBantuanAdminList(filter: BantuanFilter): Promise<BantuanAdminRow[]> {
  const { data, error } = await supabase.rpc('bantuan_admin_list', {
    p_cari: filter.cari?.trim() || null,
    p_kategori: filter.kategori ?? null,
    p_status: filter.status ?? null,
    p_dari: filter.dari ?? null,
    p_hingga: filter.hingga ?? null,
    p_had: 200,
  });
  if (error) throw error;
  return (data as BantuanAdminRow[] | null) ?? [];
}

export async function fetchBantuanSummary(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('bantuan_admin_ringkasan');
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of (data as { kunci: string; jumlah: number }[] | null) ?? []) out[row.kunci] = row.jumlah;
  return out;
}

export async function fetchBantuanPrevious(id: string): Promise<BantuanPrevious[]> {
  const { data, error } = await supabase.rpc('bantuan_admin_sebelum', { p_id: id });
  if (error) throw error;
  return (data as BantuanPrevious[] | null) ?? [];
}

export async function fetchBantuanNotes(applicationId: string): Promise<BantuanNote[]> {
  const { data, error } = await supabase
    .from('bantuan_admin_notes')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as BantuanNote[] | null) ?? [];
}

export async function startBantuanReview(id: string, versi: number): Promise<BantuanApplication> {
  const { data, error } = await supabase.rpc('bantuan_mulakan_semakan', { p_id: id, p_versi: versi });
  if (error) throw error;
  return data as BantuanApplication;
}

export async function requestBantuanInfo(id: string, versi: number, mesej: string): Promise<BantuanApplication> {
  const { data, error } = await supabase.rpc('bantuan_minta_maklumat', { p_id: id, p_versi: versi, p_mesej: mesej });
  if (error) throw error;
  return data as BantuanApplication;
}

export async function approveBantuan(
  id: string,
  versi: number,
  jumlah: number,
  alasanDalaman: string,
  mesej: string,
): Promise<BantuanApplication> {
  const { data, error } = await supabase.rpc('bantuan_luluskan', {
    p_id: id,
    p_versi: versi,
    p_jumlah: jumlah,
    p_alasan_dalaman: alasanDalaman,
    p_mesej: mesej,
  });
  if (error) throw error;
  return data as BantuanApplication;
}

export async function rejectBantuan(
  id: string,
  versi: number,
  kategori: string,
  penjelasan: string,
  alasanDalaman?: string,
): Promise<BantuanApplication> {
  const { data, error } = await supabase.rpc('bantuan_tolak', {
    p_id: id,
    p_versi: versi,
    p_kategori: kategori,
    p_penjelasan: penjelasan,
    p_alasan_dalaman: alasanDalaman?.trim() || null,
  });
  if (error) throw error;
  return data as BantuanApplication;
}

export async function addBantuanNote(id: string, nota: string): Promise<void> {
  const { error } = await supabase.rpc('bantuan_tambah_nota', { p_id: id, p_nota: nota });
  if (error) throw error;
}
