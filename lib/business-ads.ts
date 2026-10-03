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

/**
 * Poster dipapar penuh lebar telefon. Dulu 1080px sebagai had umum sebelum
 * nisbah poster ditetapkan; kini disamakan terus dengan lebar reka bentuk
 * rasmi (`POSTER_ASPECT_RATIO` bawah) supaya `ImageManipulator.resize()`
 * tidak membesarkan (upscale) poster yang sudah tepat 1024px lebar.
 */
const POSTER_MAX_WIDTH = 1024;

/**
 * Nisbah lebar:tinggi rasmi poster iklan bisnes — ahli direka bentuk
 * poster mereka sendiri pada 1024×550px sebelum muat naik (keputusan
 * 2026-10-03). Dikongsi oleh setiap skrin yang memaparkan poster (pratonton
 * muat naik, detail ahli, detail admin, kad "Semua Iklan") supaya poster
 * dipaparkan tepat pada nisbah sebenar — tiada "letterbox"/jalur kosong dan
 * tiada bahagian dipotong, sebab bekas paparan sepadan 1:1 dengan bentuk
 * fail yang dimuat naik.
 */
export const POSTER_ASPECT_RATIO = 1024 / 550;

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

/**
 * Jenis sendiri (bukan lagi `Pick<DirectoryBusinessAd, ...>`) — `get_business_ad()`
 * membawa `url_gambar_2`/`url_gambar_3` (galeri, migration 107) yang TIDAK
 * wujud dalam `list_business_directory()` (senarai ringkas tidak perlukan
 * galeri), jadi kedua-dua bentuk sudah bercabang.
 */
export type BusinessAdDetail = {
  id: string;
  member_id: string;
  nama_pemilik: string;
  nama_bisnes: string;
  /** Gambar 1 — wajib, nisbah tetap `POSTER_ASPECT_RATIO`. */
  url_poster: string;
  /** Gambar 2/3 — pilihan, bebas orientation, hanya untuk galeri skrin detail. */
  url_gambar_2: string | null;
  url_gambar_3: string | null;
  penerangan: string | null;
  teks_cta: string | null;
  no_whatsapp: string;
  status_paparan: BusinessAdStatus;
  sebab_tolak: string | null;
  is_mine: boolean;
};

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
  /** Galeri pilihan (migration 107) — null untuk kedua-dua jika ahli tidak muat naik. */
  url_gambar_2?: string | null;
  url_gambar_3?: string | null;
  penerangan: string | null;
  teks_cta: string | null;
  no_whatsapp: string;
  status_paparan: BusinessAdStatus;
  sebab_tolak: string | null;
  submitted_at: string;
  tarikh_mula: string | null;
  tarikh_tamat: string | null;
};

/** Semua iklan (mana-mana status) — senarai ringkas admin hub. */
export async function fetchAllBusinessAdsAdmin(): Promise<AdminBusinessAd[]> {
  const { data, error } = await supabase.rpc('list_all_business_ads_admin');
  if (error) throw error;
  return (data as AdminBusinessAd[] | null) ?? [];
}

/** Satu iklan, mana-mana status/pemilik — skrin detail admin (admin/iklan-detail.tsx). */
export async function fetchBusinessAdAdmin(id: string): Promise<AdminBusinessAd | null> {
  const { data, error } = await supabase.rpc('get_business_ad_admin', { p_ad_id: id });
  if (error) throw error;
  return ((data as AdminBusinessAd[] | null) ?? [])[0] ?? null;
}

/** Iklan milik pemanggil yang masih menggunakan slot (menunggu + aktif). */
export function countMyActiveAds(rows: DirectoryBusinessAd[]): number {
  return rows.filter((row) => row.is_mine && (row.status_paparan === 'menunggu' || row.status_paparan === 'diluluskan'))
    .length;
}

/**
 * Carian no. telefon SATU ahli (migration 109) — untuk pra-isi medan
 * WhatsApp di `admin/iklan-tambah.tsx` bila admin memilih ahli pemilik.
 * RPC khusus, disekat `can_review_business_ads()` — bukan `list_members_picker()`
 * (terbuka semua ahli, tiada no_tel) atau `list_members_directory()` (tiada
 * `id`, tidak boleh dipadankan). `null` bermaksud ahli tiada no_tel direkod
 * — medan WhatsApp kekal kosong, admin isi sendiri.
 */
export async function fetchMemberPhoneForBusinessAd(memberId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_member_phone_for_business_ad', { p_member_id: memberId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * Muat naik SATU gambar iklan (slot 1/2/3, sama bucket+corak nama) ke
 * `business-ads/<member_id>_<epoch ms>.jpg` — corak nama yang dikuatkuasakan
 * `storage_name_ok()` dan disemak semula oleh `submit_business_ad()` (gambar
 * mesti milik pemanggil sendiri). Setiap panggilan menghasilkan epoch
 * berlainan, jadi dipanggil 1-3 kali (satu setiap slot diisi) tanpa
 * konflik nama — tiada migration storage diperlukan untuk galeri.
 *
 * Dinamakan semula daripada `uploadBusinessPoster` (nama lama — kini
 * dikongsi oleh ketiga-tiga slot gambar, bukan khusus poster sahaja).
 */
export async function uploadBusinessImage(memberId: string, uri: string): Promise<string> {
  return uploadImage(BUCKET, memberId + '_' + Date.now() + '.jpg', uri, POSTER_MAX_WIDTH);
}

export type SubmitBusinessAdInput = {
  nama_bisnes: string;
  url_poster: string;
  /** Galeri pilihan (migration 107) — `null` membuang gambar itu (penting semasa sunting semula). */
  url_gambar_2?: string | null;
  url_gambar_3?: string | null;
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
    p_url_gambar_2: input.url_gambar_2 ?? null,
    p_url_gambar_3: input.url_gambar_3 ?? null,
  });
  if (error) throw error;
}

/**
 * Sunting & hantar semula iklan yang DITOLAK — baris sedia ada dikemaskini
 * (bukan row baharu), status kembali 'menunggu'. Ditolak oleh RPC jika
 * status bukan 'ditolak' atau bukan milik pemanggil. Iklan DILULUSKAN tidak
 * boleh disunting — tiada fungsi setara untuk status itu.
 */
export async function resubmitBusinessAd(id: string, input: SubmitBusinessAdInput): Promise<void> {
  const { error } = await supabase.rpc('resubmit_business_ad', {
    p_ad_id: id,
    p_nama_bisnes: input.nama_bisnes,
    p_url_poster: input.url_poster,
    p_penerangan: input.penerangan,
    p_teks_cta: input.teks_cta,
    p_no_whatsapp: input.no_whatsapp,
    p_url_gambar_2: input.url_gambar_2 ?? null,
    p_url_gambar_3: input.url_gambar_3 ?? null,
  });
  if (error) throw error;
}

export type SubmitBusinessAdAdminInput = SubmitBusinessAdInput & {
  /** Ahli pemilik dipilih oleh admin — bukan `my_member_id()` pemanggil. */
  member_id: string;
  /** Durasi paparan (hari, 1–365) — iklan terus 'diluluskan', tiada langkah Lulus berasingan. */
  durasi_hari: number;
};

/**
 * Admin Lajnah Ekonomi (`can_review_business_ads()`) menghantar iklan BAGI
 * PIHAK ahli lain (migration 108, diminta 2026-10-03) — TIADA had queue (20)
 * atau had 3/ahli (unlimited untuk laluan admin ini), dan terus berstatus
 * 'diluluskan' (admin yang menghantar sudahlah admin yang mengulas). Gambar
 * yang dimuat naik mesti milik ADMIN sendiri (`uploadBusinessImage` dipanggil
 * dengan ID admin, bukan ID ahli dipilih) — storage RLS menuntut ini, dan
 * `submit_business_ad_admin()` mengesahkan perkara sama di sisi DB.
 */
export async function submitBusinessAdAdmin(input: SubmitBusinessAdAdminInput): Promise<void> {
  const { error } = await supabase.rpc('submit_business_ad_admin', {
    p_member_id: input.member_id,
    p_nama_bisnes: input.nama_bisnes,
    p_url_poster: input.url_poster,
    p_penerangan: input.penerangan,
    p_teks_cta: input.teks_cta,
    p_no_whatsapp: input.no_whatsapp,
    p_durasi_hari: input.durasi_hari,
    p_url_gambar_2: input.url_gambar_2 ?? null,
    p_url_gambar_3: input.url_gambar_3 ?? null,
  });
  if (error) throw error;
}

/**
 * Pemilik (mana-mana status) atau admin Lajnah Ekonomi (can_review_business_ads())
 * sahaja. RPC memadam baris DB dan memulangkan SEMUA url gambar bukan-null
 * (poster + galeri 2/3, migration 107 — dulu hanya poster); fail storage
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

  const urls = Array.isArray(data) ? (data as unknown[]).filter((value): value is string => typeof value === 'string') : [];
  const fileNames = urls.map((url) => url.split('/' + BUCKET + '/')[1]?.split('?')[0]).filter((name): name is string => !!name);
  if (fileNames.length > 0) {
    try {
      await withTimeout(supabase.storage.from(BUCKET).remove(fileNames), 8000, 'Padam fail gambar');
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
