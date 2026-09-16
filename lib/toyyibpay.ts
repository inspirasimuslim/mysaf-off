import { Platform } from 'react-native';

import { edgeMessage } from './members';
import { supabase } from './supabase';

/**
 * Bayaran online ToyyibPay — dikongsi oleh PIPIS ASET dan Yuran Tahunan.
 *
 * App tidak pernah menentukan status bayaran. Ia hanya meminta pelayan
 * mencipta bil, dan kemudian meminta pelayan bertanya semula kepada ToyyibPay.
 */

export type GatewayKind = 'pipis' | 'yuran';

export type GatewayStatus = 'pending' | 'success' | 'failed';

export type GatewayBill = {
  bill_code: string;
  payment_url: string;
  reference: string;
  amount: number;
};

/** Baris bayaran yang mungkin datang dari gateway — bentuk sama dalam kedua-dua table. */
export type GatewayAwareRow = {
  amount: number;
  status: GatewayStatus;
  requested_amount: number | null;
};

const CREATE_FUNCTION: Record<GatewayKind, string> = {
  pipis: 'create-pipis-bill',
  yuran: 'create-yuran-bill',
};

/**
 * Cipta bil ToyyibPay. Amaun disahkan semula di pelayan (minimum RM1) — nilai
 * di sini hanya cadangan ahli.
 *
 * `returnUrl` ialah deep link app (native) atau URL app web (web). `platform`
 * memberitahu Edge Function yang mana satu dijangka: pelayar tidak boleh
 * kembali ke `mysafoff://`. Pelayan hanya menerima skema app sendiri atau
 * origin web yang disenarai, jadi ia tidak boleh dijadikan pengalihan terbuka.
 */
export async function createGatewayBill(kind: GatewayKind, amount: number, returnUrl: string): Promise<GatewayBill> {
  const { data, error } = await supabase.functions.invoke(CREATE_FUNCTION[kind], {
    body: { amount, return_url: returnUrl, platform: Platform.OS === 'web' ? 'web' : 'native' },
  });
  if (error) throw new Error(await edgeMessage(error, 'Gagal mencipta bil bayaran.'));
  if (data?.error) throw new Error(String(data.error));
  return data as GatewayBill;
}

/**
 * Minta pelayan menyemak semula status satu bayaran terus dengan ToyyibPay.
 *
 * Untuk bila webhook ToyyibPay lewat. Satu fungsi untuk semua jenis bayaran:
 * rujukan itu sendiri menentukan table mana yang dikemas kini.
 */
export async function refreshGatewayPayment(reference: string): Promise<GatewayStatus | 'unknown'> {
  const { data, error } = await supabase.functions.invoke('toyyibpay-callback', {
    body: { order_id: reference },
  });
  if (error) throw new Error(await edgeMessage(error, 'Gagal menyemak status bayaran.'));
  const status = data?.status;
  return status === 'success' || status === 'pending' || status === 'failed' ? status : 'unknown';
}

const TABLE: Record<GatewayKind, string> = {
  pipis: 'pipis_contributions',
  yuran: 'yuran_payments',
};

/**
 * Ahli membatalkan bil pending miliknya sendiri — status menjadi 'failed'.
 *
 * Hanya kemudahan paparan. Jika bil itu dibayar juga selepas dibatalkan,
 * pelayan tetap menukarnya kepada 'success' bila ToyyibPay mengesahkannya.
 */
export async function cancelGatewayPayment(kind: GatewayKind, reference: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_pending_gateway_payment', {
    p_table: TABLE[kind],
    p_reference: reference,
  });
  if (error) throw new Error(error.message);
}

/** Amaun untuk dipapar: amaun sebenar bila sah, amaun dipilih bila belum. */
export function displayAmount(row: GatewayAwareRow): number {
  return row.status === 'success' ? row.amount : (row.requested_amount ?? row.amount);
}

export function paymentStatusLabel(status: GatewayStatus): string {
  if (status === 'pending') return 'Sedang diproses';
  if (status === 'failed') return 'Tidak berjaya';
  return 'Berjaya';
}

export function paymentStatusTone(status: GatewayStatus): 'positive' | 'negative' | 'warn' {
  if (status === 'success') return 'positive';
  if (status === 'failed') return 'negative';
  return 'warn';
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
