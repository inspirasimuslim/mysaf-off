import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { errorCode, toMalayError } from './errors';
import { readJpegBytes } from './image-upload';
import { supabase } from './supabase';

/**
 * Permohonan Bantuan (one-off) — migration 148.
 *
 * SEMUA tulisan melalui RPC (`bantuan_*`); `authenticated` hanya ada SELECT pada
 * table. Status, jumlah diluluskan dan identiti pelulus ditetapkan oleh pelayan.
 * Nota dalaman berada dalam table berasingan yang ahli tidak boleh baca, jadi
 * kod ini tidak menapis medan sulit di sebelah klien.
 *
 * Kelulusan BUKAN pembayaran: modul ini tidak merekod bayaran dan tidak boleh
 * memaparkan "Dibayar" atau menjanjikan tarikh bayaran.
 */

// --- Jenis -------------------------------------------------------------------

export type BantuanStatus = 'draft' | 'submitted' | 'under_review' | 'needs_information' | 'approved' | 'rejected';
export type BantuanKategori = 'keluarga' | 'pelajar';

export type BantuanApplication = {
  id: string;
  no_rujukan: string | null;
  member_id: string;
  status: BantuanStatus;
  versi: number;
  kategori: BantuanKategori;
  tujuan: string | null;
  tujuan_lain: string | null;
  nama_pemohon: string | null;
  nombor_ahli_salin: string | null;
  telefon: string | null;
  alamat: string | null;
  keadaan: string | null;
  jumlah_dimohon: number | null;
  tahap_keperluan: 'biasa' | 'mendesak' | null;
  sebab_mendesak: string | null;
  tarikh_diperlukan: string | null;
  status_pekerjaan: string | null;
  pendapatan_jenis: 'tetap' | 'tidak_tetap' | 'tidak_pasti' | null;
  pendapatan_isi_rumah: number | null;
  pendapatan_catatan: string | null;
  bil_tanggungan: number | null;
  ringkasan_perbelanjaan: string | null;
  bantuan_lain_ada: boolean | null;
  bantuan_lain_sumber: string | null;
  bantuan_lain_amaun: number | null;
  bantuan_lain_kekerapan: string | null;
  pelajar_hubungan_pemohon: 'sendiri' | 'penjaga' | null;
  pelajar_nama: string | null;
  pelajar_hubungan_ahli: string | null;
  pelajar_institusi: string | null;
  pelajar_program: string | null;
  pelajar_tahun_semester: string | null;
  pelajar_status_pengajian: string | null;
  pelajar_bantuan_sedia_ada: string | null;
  dokumen_tiada: boolean;
  dokumen_tiada_sebab: string | null;
  pengakuan_benar: boolean;
  pengakuan_proses: boolean;
  pengakuan_satu_kali: boolean;
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

/** Medan borang yang boleh dihantar kepada `bantuan_save_draft`. */
export type BantuanForm = Partial<
  Pick<
    BantuanApplication,
    | 'kategori' | 'tujuan' | 'tujuan_lain' | 'nama_pemohon' | 'nombor_ahli_salin' | 'telefon' | 'alamat'
    | 'keadaan' | 'jumlah_dimohon' | 'tahap_keperluan' | 'sebab_mendesak' | 'tarikh_diperlukan'
    | 'status_pekerjaan' | 'pendapatan_jenis' | 'pendapatan_isi_rumah' | 'pendapatan_catatan' | 'bil_tanggungan'
    | 'ringkasan_perbelanjaan' | 'bantuan_lain_ada' | 'bantuan_lain_sumber' | 'bantuan_lain_amaun'
    | 'bantuan_lain_kekerapan' | 'pelajar_hubungan_pemohon' | 'pelajar_nama' | 'pelajar_hubungan_ahli'
    | 'pelajar_institusi' | 'pelajar_program' | 'pelajar_tahun_semester' | 'pelajar_status_pengajian'
    | 'pelajar_bantuan_sedia_ada' | 'dokumen_tiada' | 'dokumen_tiada_sebab' | 'pengakuan_benar'
    | 'pengakuan_proses' | 'pengakuan_satu_kali'
  >
>;

export type BantuanDocument = {
  id: string;
  application_id: string;
  info_request_id: string | null;
  storage_path: string;
  nama_fail: string;
  mime: string;
  saiz_bait: number;
  jenis: 'pendapatan' | 'bil' | 'pengajian' | 'lain';
  created_at: string;
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
  nombor_ahli_salin: string | null;
  kategori: BantuanKategori;
  tujuan: string | null;
  status: BantuanStatus;
  tahap_keperluan: 'biasa' | 'mendesak' | null;
  jumlah_dimohon: number | null;
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
  tujuan: string | null;
  status: BantuanStatus;
  jumlah_dimohon: number | null;
  jumlah_diluluskan: number | null;
  dihantar_at: string | null;
};

// --- Label -------------------------------------------------------------------

type Option<T extends string> = { value: T; label: string };

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
  keluarga: 'Bantuan Keluarga',
  pelajar: 'Bantuan Pelajar',
};

export const KATEGORI_PENERANGAN: Record<BantuanKategori, string> = {
  keluarga: 'Untuk ahli atau isi rumah ahli yang menghadapi kesulitan memenuhi keperluan asas.',
  pelajar: 'Untuk ahli yang sedang belajar, atau anak/tanggungan ahli yang sedang belajar.',
};

export const TUJUAN_OPTIONS: Record<BantuanKategori, Option<string>[]> = {
  keluarga: [
    { value: 'keperluan_harian', label: 'Keperluan harian' },
    { value: 'sewa_tempat_tinggal', label: 'Sewa atau tempat tinggal' },
    { value: 'rawatan_perubatan', label: 'Rawatan/perubatan' },
    { value: 'kehilangan_pendapatan', label: 'Kehilangan pendapatan' },
    { value: 'kecemasan', label: 'Kecemasan' },
    { value: 'lain_lain', label: 'Lain-lain' },
  ],
  pelajar: [
    { value: 'yuran_pengajian', label: 'Yuran pengajian' },
    { value: 'buku_peralatan', label: 'Buku dan peralatan pembelajaran' },
    { value: 'pengangkutan', label: 'Pengangkutan' },
    { value: 'penginapan_hidup', label: 'Penginapan atau keperluan hidup semasa belajar' },
    { value: 'lain_lain', label: 'Lain-lain' },
  ],
};

export function tujuanLabel(kategori: BantuanKategori, tujuan: string | null, lain?: string | null): string {
  if (!tujuan) return '—';
  const label = TUJUAN_OPTIONS[kategori].find((option) => option.value === tujuan)?.label ?? tujuan;
  return tujuan === 'lain_lain' && lain ? label + ': ' + lain : label;
}

export const TAHAP_OPTIONS: Option<'biasa' | 'mendesak'>[] = [
  { value: 'biasa', label: 'Biasa' },
  { value: 'mendesak', label: 'Mendesak' },
];

export const PEKERJAAN_OPTIONS: Option<string>[] = [
  { value: 'bekerja', label: 'Bekerja (makan gaji)' },
  { value: 'bekerja_sendiri', label: 'Bekerja sendiri/berniaga' },
  { value: 'tidak_bekerja', label: 'Tidak bekerja' },
  { value: 'suri_rumah', label: 'Suri rumah' },
  { value: 'pesara', label: 'Pesara' },
  { value: 'pelajar', label: 'Pelajar' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

export const PENDAPATAN_OPTIONS: Option<'tetap' | 'tidak_tetap' | 'tidak_pasti'>[] = [
  { value: 'tetap', label: 'Tetap' },
  { value: 'tidak_tetap', label: 'Tidak tetap' },
  { value: 'tidak_pasti', label: 'Tidak pasti' },
];

export const PENGAJIAN_OPTIONS: Option<string>[] = [
  { value: 'sedang_belajar', label: 'Sedang belajar' },
  { value: 'akan_mendaftar', label: 'Akan mendaftar' },
  { value: 'tangguh', label: 'Menangguh pengajian' },
  { value: 'tamat', label: 'Telah tamat' },
];

export const TOLAK_OPTIONS: Option<string>[] = [
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
  nota: 'Nota dalaman ditambah',
  pindaan: 'Perubahan semasa hantar semula',
};

export const MAX_DOCUMENTS = 5;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const BUCKET = 'bantuan-docs';

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
  'Permohonan anda telah diluluskan. Pihak Lajnah Kebajikan akan menghubungi anda untuk urusan penyerahan bantuan.';

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

export async function fetchBantuanDocuments(applicationId: string): Promise<BantuanDocument[]> {
  const { data, error } = await supabase
    .from('bantuan_documents')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as BantuanDocument[] | null) ?? [];
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

// --- Dokumen ------------------------------------------------------------------

export type PickedFile = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  webFile?: globalThis.File;
};

function extensionOf(file: PickedFile): 'pdf' | 'jpg' | 'png' | null {
  const mime = (file.mimeType ?? '').toLowerCase();
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime === 'image/png' || ext === 'png') return 'png';
  if (mime === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpg';
  return null;
}

async function readBytes(file: PickedFile): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    if (file.webFile) return new Uint8Array(await file.webFile.arrayBuffer());
    return new Uint8Array(await (await fetch(file.uri)).arrayBuffer());
  }
  return await new File(file.uri).bytes();
}

/**
 * Muat naik satu dokumen sokongan. Semakan di sini sekadar kemudahan: Storage
 * (saiz + MIME bucket) dan `bantuan_add_document` (had 5 fail, status, pemilikan,
 * saiz sebenar) mengesahkannya semula di pelayan. Jika pendaftaran gagal, objek
 * yang baru dimuat naik dibuang supaya tidak tertinggal tanpa rekod.
 */
export async function uploadBantuanDocument(
  applicationId: string,
  file: PickedFile,
  jenis: BantuanDocument['jenis'],
): Promise<BantuanDocument> {
  const ext = extensionOf(file);
  if (!ext) throw new Error('Hanya fail PDF, JPG dan PNG dibenarkan.');

  let bytes: Uint8Array;
  if (ext === 'pdf') {
    bytes = await readBytes(file);
    if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('Saiz fail melebihi 5 MB.');
    if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 4)) !== '%PDF') {
      throw new Error('Fail PDF tidak sah.');
    }
  } else {
    // Gambar dimampatkan kepada JPEG (menjimatkan kuota dan memastikan di bawah 5 MB).
    bytes = await readJpegBytes(file.uri, 1600);
    if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('Saiz fail melebihi 5 MB.');
  }
  if (bytes.length === 0) throw new Error('Fail kosong.');

  const storedExt = ext === 'pdf' ? 'pdf' : 'jpg';
  const contentType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
  const path = applicationId + '/' + newId() + '.' + storedExt;

  const upload = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase.rpc('bantuan_add_document', {
    p_app: applicationId,
    p_path: path,
    p_nama_fail: file.name.slice(0, 200),
    p_jenis: jenis,
  });
  if (error) {
    void supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data as BantuanDocument;
}

export async function removeBantuanDocument(documentId: string): Promise<void> {
  const { data, error } = await supabase.rpc('bantuan_remove_document', { p_doc: documentId });
  if (error) throw error;
  if (typeof data === 'string' && data) void supabase.storage.from(BUCKET).remove([data]);
}

/** URL bertandatangan sementara (5 minit) — fail kekal persendirian. */
export async function bantuanDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error ?? new Error('Pautan dokumen tidak dapat dijana.');
  return data.signedUrl;
}

// --- Admin --------------------------------------------------------------------

export type BantuanFilter = {
  cari?: string;
  kategori?: BantuanKategori | null;
  status?: BantuanStatus | null;
  dari?: string | null;
  hingga?: string | null;
  mendesak?: boolean;
};

export async function fetchBantuanAdminList(filter: BantuanFilter): Promise<BantuanAdminRow[]> {
  const { data, error } = await supabase.rpc('bantuan_admin_list', {
    p_cari: filter.cari?.trim() || null,
    p_kategori: filter.kategori ?? null,
    p_status: filter.status ?? null,
    p_dari: filter.dari ?? null,
    p_hingga: filter.hingga ?? null,
    p_mendesak: filter.mendesak ?? false,
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
