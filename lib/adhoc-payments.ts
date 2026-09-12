import type { AdhocPaymentType } from '@/types/database';

import { uploadImage } from './image-upload';
import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk pembayaran adhoc.
 *
 * Sama seperti `lib/announcements.ts`: setiap fungsi melontar ralat mentah
 * Supabase dan tidak menyemak peranan sendiri. RLS pada `adhoc_payment_types`
 * yang menentukan siapa boleh membaca dan menulis — lihat
 * `20260912000016_adhoc_payments.sql`.
 */

const QR_BUCKET = 'payment-qr';

/**
 * Kod QR dipapar besar untuk diimbas dari skrin telefon lain, jadi ia
 * memerlukan lebih resolusi daripada poster: corak QR yang dikecilkan terlalu
 * banyak menjadi kabur dan kamera gagal menguncinya.
 */
const QR_MAX_WIDTH = 1400;

export type AdhocPaymentInput = {
  title: string;
  description: string | null;
  qr_image_url: string | null;
  is_active: boolean;
};

/**
 * Senarai yang boleh dilihat pemanggil.
 *
 * Ahli biasa mendapat yang aktif sahaja dan bendahari mendapat kesemuanya —
 * perbezaan itu datang daripada policy `adhoc_payment_types_select`, bukan
 * daripada penapis di sini. Satu fungsi melayan skrin ahli dan skrin admin
 * kerana soalannya sama: "apa yang saya dibenarkan lihat".
 */
export async function fetchAdhocPayments(): Promise<AdhocPaymentType[]> {
  const { data, error } = await supabase
    .from('adhoc_payment_types')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as AdhocPaymentType[] | null) ?? [];
}

export async function fetchAdhocPayment(id: string): Promise<AdhocPaymentType | null> {
  const { data, error } = await supabase
    .from('adhoc_payment_types')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return (data as AdhocPaymentType | null) ?? null;
}

/**
 * Muat naik kod QR ke laluan yang dijana sendiri.
 *
 * Penanda masa dan bukan id baris: QR boleh dipilih SEBELUM baris dicipta,
 * jadi tiada id untuk dinamakan lagi. Fail lama tidak dipadam apabila QR
 * ditukar — ia beberapa kilobait, dan memadamnya bermakna satu lagi cara
 * untuk kehilangan imej yang masih dirujuk oleh baris lain.
 */
export async function uploadPaymentQr(uri: string): Promise<string> {
  const path = 'qr-' + Date.now() + '.jpg';
  return uploadImage(QR_BUCKET, path, uri, QR_MAX_WIDTH);
}

export async function createAdhocPayment(input: AdhocPaymentInput): Promise<AdhocPaymentType> {
  const { data: session } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('adhoc_payment_types')
    .insert({ ...input, created_by: session.user?.id ?? null })
    .select('*')
    .single();

  if (error) throw error;
  return data as AdhocPaymentType;
}

/** Kemas kini dan pulangkan baris terkini — baris kosong bermakna RLS menolaknya. */
export async function updateAdhocPayment(
  id: string,
  patch: Partial<AdhocPaymentInput>,
): Promise<AdhocPaymentType> {
  const { data, error } = await supabase
    .from('adhoc_payment_types')
    .update(patch)
    .eq('id', id)
    .select('*');

  if (error) throw error;

  const row = (data as AdhocPaymentType[] | null)?.[0];
  if (!row) {
    throw new Error(
      'Perubahan tidak disimpan — rekod tidak dijumpai atau anda tiada kebenaran mengubahnya.',
    );
  }

  return row;
}

export async function deleteAdhocPayment(id: string): Promise<void> {
  const { error } = await supabase.from('adhoc_payment_types').delete().eq('id', id);
  if (error) throw error;
}
