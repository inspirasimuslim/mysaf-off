import Constants from 'expo-constants';

import { getItem, setItem } from '@/lib/secure-storage';

/**
 * Senarai ciri MySAFF (Bahasa Malaysia) dan catatan "Apa yang baharu" bagi setiap versi.
 *
 * AMALAN: setiap kali versi app dinaikkan (app.json), tambah entri BAHARU di HUJUNG
 * `CHANGELOG` (versi sama persis dengan `version` dalam app.json) dan, jika ada ciri
 * baharu, tambah ke `FEATURE_GROUPS`. Notifikasi di Utama hanya muncul bila entri
 * untuk versi terpasang wujud dan ahli belum menutupnya.
 */

export type FeatureGroup = {
  title: string;
  icon: string;
  items: string[];
};

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: 'Utama',
    icon: 'home-outline',
    items: [
      'Ringkasan yuran dan PIPIS dalam satu paparan.',
      'Pengumuman dan acara terkini persatuan.',
      'Notifikasi dalam app untuk balasan, permohonan dan perkara yang perlu tindakan.',
      'Hari jadi ahli pada bulan semasa.',
    ],
  },
  {
    title: 'Profil & Maklumat Ahli',
    icon: 'person-outline',
    items: [
      'Kemas kini maklumat peribadi, pendidikan, pekerjaan, perniagaan, keluarga, komitmen dan kesihatan.',
      'Maklumat kesihatan hanya boleh dilihat oleh anda dan pihak yang diberi kebenaran.',
      'Status kelengkapan data dan tarikh kemas kini terakhir.',
    ],
  },
  {
    title: 'Ahli & Organisasi',
    icon: 'people-outline',
    items: [
      'Direktori ahli dengan carian dan jawatan dalam carta organisasi.',
      'Carta organisasi persatuan.',
      'Senarai pasangan ahli MBM dan rumusan statistik ahli.',
    ],
  },
  {
    title: 'Pembayaran',
    icon: 'card-outline',
    items: [
      'Bayar yuran dan sumbangan PIPIS secara dalam talian melalui ToyyibPay.',
      'Infaq Tabung Zakat tanpa sasaran, lengkap dengan sejarah pembayaran anda.',
      'Bayaran khas (ad-hoc) mengikut keperluan persatuan.',
      'Rekod yuran dan sumbangan sendiri boleh disemak pada bila-bila masa.',
    ],
  },
  {
    title: 'Direktori',
    icon: 'grid-outline',
    items: [
      'Permohonan Bantuan Zakat (belajar / bekerja / berkahwin) dengan jejak status permohonan.',
      'Bantuan Kaunseling: hubungi kaunselor melalui WhatsApp, telefon atau mesej dalam app. Pihak Lajnah Kebajikan hanya tahu bilangan, bukan identiti anda.',
      'Album gambar acara.',
      'Koleksi Dokumen persatuan.',
      'Bisnes Ahli: promosi dan carian perniagaan ahli.',
      'Majlis Baitul Muslim.',
      'Maklum Balas: berbual terus dengan department yang anda pilih.',
      'Features MySAFF: senarai ciri dan catatan versi ini.',
    ],
  },
  {
    title: 'Pentadbir (Admin Hub)',
    icon: 'shield-checkmark-outline',
    items: [
      'Hub setiap department dengan butang Maklum Balas dan notifikasi sendiri.',
      'Pengurusan ahli, yuran, PIPIS, acara, pengumuman dan dokumen mengikut kebenaran.',
      'Pengurusan Tabung Zakat: permohonan bantuan dan rekod infaq (muat turun Excel).',
      'Pelantikan kaunselor dan senarai kaunselor aktif / dibuang bersama bilangan hubungan.',
      'Kehadiran usrah dan imbasan kod.',
    ],
  },
  {
    title: 'Keselamatan & Privasi',
    icon: 'lock-closed-outline',
    items: [
      'Akses data mengikut peranan dan department.',
      'Kunci masa tidak aktif secara automatik.',
      'Data sensitif (kesihatan, kaunseling) dilindungi dengan akses terhad.',
    ],
  },
];

export type ChangelogEntry = {
  version: string;
  date: string;
  highlights: string[];
};

/** Versi terbaru di HUJUNG. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.3.29',
    date: '13 Okt 2026',
    highlights: [
      'Maklum Balas kini dihantar kepada department pilihan anda; setiap department mempunyai peti masuk dan notifikasi sendiri.',
      'Seksyen baharu dalam Admin Hub: TSUA, LHESA, LPN, LM dan I-GEM.',
      'Bantuan Kaunseling: hubungi kaunselor dengan privasi terjaga.',
      'Infaq Tabung Zakat dalam tab Bayar / Infaq.',
    ],
  },
  {
    version: '1.3.30',
    date: '13 Okt 2026',
    highlights: [
      'Features MySAFF: senarai lengkap ciri app dalam Bahasa Malaysia di tab Direktori.',
      'Notifikasi "Apa yang baharu" selepas app dikemas kini.',
    ],
  },
];

const SEEN_KEY = 'mysaff.whatsnew.seen';

export function currentAppVersion(): string {
  return Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '';
}

export function changelogForVersion(version: string): ChangelogEntry | null {
  return CHANGELOG.find((entry) => entry.version === version) ?? null;
}

export async function getSeenVersion(): Promise<string | null> {
  try {
    return await getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export async function markVersionSeen(version: string): Promise<void> {
  try {
    await setItem(SEEN_KEY, version);
  } catch {
    // Simpanan tidak tersedia: notifikasi mungkin muncul semula, tidak kritikal.
  }
}
