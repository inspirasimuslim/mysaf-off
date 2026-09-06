import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

/**
 * Sekatan akaun.
 *
 * `members.disekat` ialah tanda pentadbiran, bukan keadaan Auth — Supabase Auth
 * tidak tahu apa-apa mengenainya, jadi akaun yang disekat masih boleh log masuk
 * dan mendapat token yang sah.
 *
 * Sekatan sebenar dikuatkuasakan di PANGKALAN DATA (lihat
 * `20260906000007_suspension_enforcement.sql`): policy `members`, direktori
 * ahli dan semua kebenaran admin menolak akaun yang disekat. Fail ini ialah
 * lapisan PENGALAMAN PENGGUNA di atasnya — ia yang mengeluarkan pengguna dari
 * app dan memberitahu sebabnya, supaya dia tidak berdepan skrin kosong.
 */

export const SUSPENDED_MESSAGE = 'Akaun anda telah disekat. Hubungi admin untuk maklumat lanjut.';

/**
 * Sebab log keluar terakhir, untuk dipapar pada skrin log masuk.
 *
 * Disimpan sebagai pemboleh ubah modul dan bukan dalam state: akaun yang
 * disekat dilog keluar serta-merta, jadi komponen yang mengesannya sudah
 * dilepaskan sebelum sempat memapar apa-apa. Nilai ini merentasi peralihan itu.
 */
let pendingNotice: string | null = null;

export function setAuthNotice(message: string): void {
  pendingNotice = message;
}

/** Baca sekali sahaja — mesej yang sama tidak sepatutnya muncul lagi selepas dibaca. */
export function takeAuthNotice(): string | null {
  const notice = pendingNotice;
  pendingNotice = null;
  return notice;
}

/**
 * `'unknown'` ialah jawapan yang SAH dan bukan ralat yang boleh diabaikan.
 *
 * Versi terdahulu memulangkan `false` bila bacaan gagal, jadi sekatan boleh
 * dilangkau hanya dengan mematikan talian. Keadaan "tidak diketahui" kini
 * dinamakan supaya pemanggil terpaksa memutuskan apa hendak dibuat dengannya.
 */
export type AccountStatus = 'checking' | 'active' | 'suspended' | 'unknown';

/** Percubaan bacaan sebelum menyerah — kegagalan sekejap lebih lazim daripada sekatan. */
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

/** Selang semakan semula bagi sesi yang sedang hidup. */
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Status akaun yang sedang log masuk.
 *
 * Melalui RPC dan bukan `select` terus: `my_account_suspended()` ialah
 * `security definer`, jadi ia menemui rekod ahli walaupun `user_id` belum
 * dipautkan — itulah punca sekatan tidak berkesan sebelum ini. Rekod yang
 * diimport dari Excel hanya dipautkan apabila skrin Profil dibuka, jadi ahli
 * yang terus ke Dashboard tidak pernah dipadankan dengan rekodnya.
 */
export async function fetchAccountStatus(): Promise<AccountStatus> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase.rpc('my_account_suspended');
    if (!error) return data === true ? 'suspended' : 'active';
    if (attempt < ATTEMPTS - 1) await delay(RETRY_DELAY_MS * (attempt + 1));
  }

  return 'unknown';
}

/**
 * Status akaun, disemak semula sepanjang sesi hidup.
 *
 * Semakan diulang apabila app kembali ke latar depan dan pada selang tetap,
 * kerana admin boleh menyekat seseorang SEMASA sesinya terbuka — sekali semak
 * pada waktu log masuk sahaja bermakna sekatan hanya berkuat kuasa selepas app
 * dimulakan semula.
 *
 * Dua jenis semakan, dua peraturan berbeza:
 *
 * - Semakan PERTAMA gagal-tertutup. Tanpa jawapan, tiada bukti akaun ini
 *   dibenarkan masuk, jadi pemanggil menerima `'unknown'` dan menahan app.
 *
 * - Semakan LATAR gagal-terbuka terhadap `'unknown'` sahaja. Talian terputus
 *   bukan bukti seseorang disekat, dan mengosongkan skrin akan membuang keadaan
 *   navigasi pengguna yang sedang bekerja. Jawapan `'suspended'` tetap
 *   bertindak serta-merta.
 */
export function useAccountStatus(userId: string | null): {
  status: AccountStatus;
  recheck: () => void;
} {
  const [status, setStatus] = useState<AccountStatus>('checking');
  const [attempt, setAttempt] = useState(0);

  const recheck = useCallback(() => setAttempt((current) => current + 1), []);

  /** `true` sebaik satu jawapan muktamad diterima untuk `userId` semasa. */
  const settled = useRef(false);

  // Pengguna bertukar: jawapan lama tidak lagi terpakai kepada sesi baharu.
  useEffect(() => {
    settled.current = false;
    setStatus('checking');
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    void (async () => {
      const next = await fetchAccountStatus();
      if (!active) return;
      if (next === 'unknown' && settled.current) return;
      if (next !== 'unknown') settled.current = true;
      setStatus(next);
    })();

    return () => {
      active = false;
    };
  }, [userId, attempt]);

  useEffect(() => {
    if (!userId) return;

    const timer = setInterval(recheck, RECHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [userId, recheck]);

  return { status, recheck };
}
