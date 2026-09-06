import { supabase } from './supabase';

/**
 * Sekatan akaun.
 *
 * `members.disekat` ialah tanda pentadbiran, bukan keadaan Auth — Supabase Auth
 * tidak tahu apa-apa mengenainya, jadi akaun yang disekat masih boleh log masuk
 * dan mendapat token yang sah. Sekatan itu dikuatkuasakan di lapisan app:
 * `app/(app)/_layout.tsx` menyemaknya sebelum memasang mana-mana tab.
 *
 * Policy `members_select` sudah membenarkan seseorang membaca barisnya sendiri
 * (`user_id = auth.uid()`), jadi semakan ini berfungsi tanpa melonggarkan RLS.
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
 * `true` bila akaun ini terikat pada rekod ahli yang disekat.
 *
 * Akaun tanpa rekod ahli (belum dipautkan) TIDAK disekat — ia hanya belum
 * dipadankan, dan skrin Profil sudah mengendalikan keadaan itu.
 */
export async function isSuspended(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('members')
    .select('disekat')
    .eq('user_id', userId)
    .maybeSingle();

  // Kegagalan bacaan tidak boleh mengunci pengguna keluar dari appnya sendiri;
  // sekatan ialah tindakan pentadbiran yang perlu disahkan, bukan diandaikan.
  if (error) return false;

  return data?.disekat === true;
}
