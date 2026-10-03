import { errorCode, toMalayError } from './errors';
import { uploadImage } from './image-upload';
import { supabase } from './supabase';

/**
 * Iklan Perniagaan Ahli (`member_business_ads`) — migration 099.
 *
 * SEMUA tulisan melalui RPC (`submit_business_ad`, `review_business_ad`); tiada
 * INSERT/UPDATE terus. Siapa boleh melihat apa ditentukan sepenuhnya oleh RPC
 * bacaan (identiti pemanggil daripada sesi, bukan parameter), jadi kod ini
 * tidak menapis semula.
 */

const BUCKET = 'business-ads';

/**
 * Pagar keselamatan — pernah berlaku UI admin "jadi loading" selama-lamanya
 * selepas satu padam berjaya (punca sebenar: senarai dimuat semula SEBELUM
 * status loading di-reset — lihat `semakan-iklan.tsx`). Had masa di sini
 * ialah lapisan kedua supaya satu panggilan rangkaian yang tersekat tidak
 * boleh mengunci UI buat selama-lamanya walau apa jua puncanya.
 */
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + ' mengambil masa terlalu lama. Sila cuba lagi.')), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Poster dipapar penuh lebar telefon; 1080px lebih daripada cukup (had bucket 5MB). */
const POSTER_MAX_WIDTH = 1080;

/** Sepadan dengan `c_max_per_ahli` dalam `submit_business_ad()`. */
export const MAX_ADS_PER_MEMBER = 3;

export type BusinessAdStatus = 'menunggu' | 'diluluskan' | 'ditolak' | 'tamat_tempoh';

export type ActiveBusinessAd = {
  id: string;
  member_id: string;
  nama_pemilik: string;
  nama_bisnes: string;
  url_poster: string;
  penerangan: string | null;
  teks_cta: string | null;
  no_whatsapp: string;
  tarikh_mula: string;
  tarikh_tamat: string;
};

export type DirectoryBusinessAd = {
  id: string;
  member_id: string;
  nama_pemilik: string;
  nama_bisnes: string;
  url_poster: string;
  penerangan: string | null;
  teks_cta: string | null;
  no_whatsapp: string;
  status_paparan: BusinessAdStatus;
  sebab_tolak: string | null;
  is_mine: boolean;
  submitted_at: string;
  tarikh_mula: string | null;
  tarikh_tamat: string | null;
};

export type BusinessAdDetail = Pick<
  DirectoryBusinessAd,
  | 'id'
  | 'member_id'
  | 'nama_pemilik'
  | 'nama_bisnes'
  | 'url_poster'
  | 'penerangan'
  | 'teks_cta'
  | 'no_whatsapp'
  | 'status_paparan'
  | 'sebab_tolak'
  | 'is_mine'
>;

export type PendingBusinessAd = {
  id: string;
  member_id: string;
  nama_pemilik: string;
  no_keahlian: string | null;
  nama_bisnes: string;
  url_poster: string;
  penerangan: string | null;
  teks_cta: string | null;
  no_whatsapp: string;
  submitted_at: string;
  queue_used: number;
};

export async function fetchActiveBusinessAds(): Promise<ActiveBusinessAd[]> {
  const { data, error } = await supabase.rpc('list_active_business_ads');
  if (error) throw error;
  return (data as ActiveBusinessAd[] | null) ?? [];
}

export async function fetchBusinessDirectory(): Promise<DirectoryBusinessAd[]> {
  const { data, error } = await supabase.rpc('list_business_directory');
  if (error) throw error;
  return (data as DirectoryBusinessAd[] | null) ?? [];
}

export async function fetchBusinessAd(id: string): Promise<BusinessAdDetail | null> {
  const { data, error } = await supabase.rpc('get_business_ad', { p_ad_id: id });
  if (error) throw error;
  return ((data as BusinessAdDetail[] | null) ?? [])[0] ?? null;
}

export async function fetchPendingBusinessAds(): Promise<PendingBusinessAd[]> {
  const { data, error } = await supabase.rpc('list_pending_business_ads');
  if (error) throw error;
  return (data as PendingBusinessAd[] | null) ?? [];
}

export type AdminBusinessAd = {
  id: string;
  member_id: string;
  nama_pemilik: string;
  no_keahlian: string | null;
  nama_bisnes: string;
  url_poster: string;
  penerangan: string | null;
  teks_cta: string | null;
  no_whatsapp: string;
  status_paparan: BusinessAdStatus;
  sebab_tolak: string | null;
  submitted_at: string;
  tarikh_mula: string | null;
  tarikh_tamat: string | null;
};

/** Semua iklan (mana-mana status) — untuk tab "Semua Iklan" admin memadam iklan yang sudah diluluskan/ditolak/tamat. */
export async function fetchAllBusinessAdsAdmin(): Promise<AdminBusinessAd[]> {
  const { data, error } = await supabase.rpc('list_all_business_ads_admin');
  if (error) throw error;
  return (data as AdminBusinessAd[] | null) ?? [];
}

/** Iklan milik pemanggil yang masih menggunakan slot (menunggu + aktif). */
export function countMyActiveAds(rows: DirectoryBusinessAd[]): number {
  return rows.filter((row) => row.is_mine && (row.status_paparan === 'menunggu' || row.status_paparan === 'diluluskan'))
    .length;
}

/**
 * Muat naik poster ke `business-ads/<member_id>_<epoch ms>.jpg` — corak nama
 * yang dikuatkuasakan `storage_name_ok()` dan disemak semula oleh
 * `submit_business_ad()` (poster mesti milik pemanggil sendiri).
 */
export async function uploadBusinessPoster(memberId: string, uri: string): Promise<string> {
  return uploadImage(BUCKET, memberId + '_' + Date.now() + '.jpg', uri, POSTER_MAX_WIDTH);
}

export type SubmitBusinessAdInput = {
  nama_bisnes: string;
  url_poster: string;
  penerangan: string;
  teks_cta: string;
  no_whatsapp: string;
};

export async function submitBusinessAd(input: SubmitBusinessAdInput): Promise<void> {
  const { error } = await supabase.rpc('submit_business_ad', {
    p_nama_bisnes: input.nama_bisnes,
    p_url_poster: input.url_poster,
    p_penerangan: input.penerangan,
    p_teks_cta: input.teks_cta,
    p_no_whatsapp: input.no_whatsapp,
  });
  if (error) throw error;
}

/**
 * Pemilik (mana-mana status) atau admin Lajnah Ekonomi (can_review_business_ads())
 * sahaja. RPC memadam baris DB dan memulangkan `url_poster`; fail storage
 * dipadam DI SINI melalui Storage API (Supabase menyekat DELETE terus pada
 * `storage.objects` melalui SQL) — kegagalan pemadaman fail ditelan senyap
 * sebab baris DB sudah berjaya dipadam (fail tertinggal tidak berbahaya).
 */
export async function deleteBusinessAd(id: string): Promise<void> {
  const { data, error } = await withTimeout(
    supabase.rpc('delete_business_ad', { p_ad_id: id }),
    15000,
    'Padam iklan',
  );
  if (error) throw error;

  const urlPoster = typeof data === 'string' ? data : null;
  const fileName = urlPoster?.split('/' + BUCKET + '/')[1]?.split('?')[0];
  if (fileName) {
    try {
      await withTimeout(supabase.storage.from(BUCKET).remove([fileName]), 8000, 'Padam fail poster');
    } catch {
      // Baris DB sudah dipadam; fail anak yatim di storage bukan masalah kritikal.
    }
  }
}

export async function reviewBusinessAd(
  id: string,
  decision: { keputusan: 'diluluskan'; durasiHari: number } | { keputusan: 'ditolak'; sebab: string },
): Promise<void> {
  const { error } = await supabase.rpc('review_business_ad', {
    p_ad_id: id,
    p_keputusan: decision.keputusan,
    p_durasi_hari: decision.keputusan === 'diluluskan' ? decision.durasiHari : null,
    p_sebab_tolak: decision.keputusan === 'ditolak' ? decision.sebab : null,
  });
  if (error) throw error;
}

/**
 * Ralat daripada RPC iklan. `submit_business_ad`/`review_business_ad` melontar
 * mesej BM yang sudah siap untuk pengguna (queue penuh, had 3 iklan, nombor
 * WhatsApp tidak sah...) dengan kod P0001/22023/42501/P0002 — dipaparkan
 * apa adanya, bukan ditelan oleh `toMalayError` menjadi mesej generik.
 */
export function businessAdError(error: unknown, fallback: string): string {
  const code = errorCode(error);
  if (code && ['P0001', '22023', '42501', 'P0002'].includes(code)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return toMalayError(error, fallback);
}
