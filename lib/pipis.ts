import { edgeMessage } from './members';
import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk sumbangan PIPIS ASET.
 *
 * Peratus TIDAK dikira di sini. Ia datang daripada `pipis_member_summary()`
 * bersama jumlahnya, atas sebab yang sama seperti baki yuran: dua tempat yang
 * mengira nombor yang sama ialah dua tempat yang boleh memberi jawapan
 * berbeza tentang wang seseorang.
 */

/** Sasaran sekali seumur hidup. Untuk LABEL sahaja — pengiraan milik SQL. */
export const PIPIS_TARGET = 5000;

export type PipisStatus = 'Belum Cukup' | 'Cukup RM5000' | 'Lebih RM5000';

export type PipisSummary = {
  /** Jumlah bersih semua sumbangan tolak pelarasan. */
  jumlah: number;
  sasaran: number;
  /** Boleh melebihi 100 — sumbangan tiada siling. */
  peratus: number;
  status: PipisStatus;
};

export type PipisPaymentStatus = 'pending' | 'success' | 'failed';

export type PipisContribution = {
  id: string;
  member_id: string;
  /** Kekal 0 bagi bayaran online yang belum disahkan — lihat `displayAmount`. */
  amount: number;
  method: 'import' | 'manual_adjustment' | 'gateway';
  /** Import dan pelarasan sentiasa 'success'; hanya 'gateway' boleh lain. */
  status: PipisPaymentStatus;
  /** Amaun yang ahli pilih sebelum membayar online. */
  requested_amount: number | null;
  gateway_reference: string | null;
  note: string | null;
  created_at: string;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Ringkasan seorang ahli.
 *
 * RPC sentiasa memulangkan satu baris, termasuk untuk ahli yang tiada rekod
 * langsung — baris sifar. Keadaan "belum menyumbang" ialah jawapan yang sah,
 * bukan ketiadaan jawapan.
 */
export async function fetchPipisSummary(memberId: string): Promise<PipisSummary> {
  const { data, error } = await supabase.rpc('pipis_member_summary', { p_member_id: memberId });
  if (error) throw error;

  const row = ((data as PipisSummary[] | null) ?? [])[0];

  return {
    jumlah: toNumber(row?.jumlah),
    sasaran: row ? toNumber(row.sasaran) : PIPIS_TARGET,
    peratus: toNumber(row?.peratus),
    status: row?.status ?? 'Belum Cukup',
  };
}

/**
 * Sejarah penuh seorang ahli, terbaharu dahulu.
 *
 * Bacaan terus pada table dan bukan RPC: RLS sudah membenarkan ahli melihat
 * rekodnya sendiri dan admin PIPIS melihat semua, jadi fungsi `security
 * definer` di sini hanya akan mengulangi peraturan yang sudah wujud.
 */
export async function fetchPipisHistory(memberId: string): Promise<PipisContribution[]> {
  const { data, error } = await supabase
    .from('pipis_contributions')
    .select('id, member_id, amount, method, status, requested_amount, gateway_reference, note, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data as PipisContribution[] | null) ?? []).map((row) => ({
    ...row,
    amount: toNumber(row.amount),
    requested_amount: row.requested_amount === null ? null : toNumber(row.requested_amount),
    status: row.status ?? 'success',
  }));
}

// --- Bayaran online (ToyyibPay) ----------------------------------------------

export type PipisBill = {
  bill_code: string;
  payment_url: string;
  reference: string;
  amount: number;
};

/**
 * Cipta bil ToyyibPay. Amaun disahkan semula di pelayan (minimum RM1) — nilai
 * di sini hanya cadangan ahli.
 *
 * `returnUrl` ialah deep link app; Edge Function hanya menerima skema app
 * sendiri, jadi ia tidak boleh dijadikan pengalihan ke laman lain.
 */
export async function createPipisBill(amount: number, returnUrl: string): Promise<PipisBill> {
  const { data, error } = await supabase.functions.invoke('create-pipis-bill', {
    body: { amount, return_url: returnUrl },
  });
  if (error) throw new Error(await edgeMessage(error, 'Gagal mencipta bil bayaran.'));
  if (data?.error) throw new Error(String(data.error));
  return data as PipisBill;
}

/**
 * Minta pelayan menyemak semula status satu bayaran terus dengan ToyyibPay.
 *
 * Untuk bila webhook ToyyibPay lewat. Keputusan tetap dibuat oleh pelayan
 * selepas bertanya kepada ToyyibPay — app tidak menentukan apa-apa status.
 */
export async function refreshPipisPayment(reference: string): Promise<PipisPaymentStatus | 'unknown'> {
  const { data, error } = await supabase.functions.invoke('toyyibpay-callback', {
    body: { order_id: reference },
  });
  if (error) throw new Error(await edgeMessage(error, 'Gagal menyemak status bayaran.'));
  const status = data?.status;
  return status === 'success' || status === 'pending' || status === 'failed' ? status : 'unknown';
}

/** Amaun untuk dipapar: amaun sebenar bila sah, amaun dipilih bila belum. */
export function displayAmount(row: PipisContribution): number {
  return row.status === 'success' ? row.amount : (row.requested_amount ?? row.amount);
}

export function paymentStatusLabel(status: PipisPaymentStatus): string {
  if (status === 'pending') return 'Sedang diproses';
  if (status === 'failed') return 'Tidak berjaya';
  return 'Berjaya';
}

export type PipisAdjustmentInput = {
  memberId: string;
  /** Positif = sumbangan; negatif = potongan. Tanda ditetapkan oleh pemanggil. */
  amount: number;
  note: string | null;
};

export async function addPipisAdjustment(input: PipisAdjustmentInput): Promise<void> {
  const { data: session } = await supabase.auth.getUser();

  const { error } = await supabase.from('pipis_contributions').insert({
    member_id: input.memberId,
    amount: input.amount,
    method: 'manual_adjustment',
    note: input.note,
    created_by: session.user?.id ?? null,
  });

  if (error) throw error;
}

/**
 * Tulis sumbangan yang diimport bagi seorang ahli.
 *
 * Melalui RPC dan bukan `insert` terus supaya larian import yang kedua
 * MENGGANTIKAN angka ahli itu dan bukan menambahnya — pemadaman baris import
 * lama dan kemasukan baris baharu berlaku dalam satu transaksi.
 */
export async function importPipisContribution(memberId: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc('import_pipis_contribution', {
    p_member_id: memberId,
    p_amount: amount,
  });

  if (error) throw new Error(error.message);
}

// --- Senarai admin -----------------------------------------------------------

export type PipisReportRow = {
  member_id: string;
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  jumlah: number;
  peratus: number;
  status: PipisStatus;
};

/**
 * Satu baris setiap ahli, penyumbang terbesar dahulu.
 *
 * Dikongsi oleh skrin senarai admin dan eksport Excel: kedua-duanya menjawab
 * soalan yang sama, jadi keduanya patut mendapat nombor yang sama daripada
 * pertanyaan yang sama.
 */
export async function fetchPipisReport(): Promise<PipisReportRow[]> {
  const { data, error } = await supabase.rpc('pipis_full_report');
  if (error) throw error;

  return ((data as PipisReportRow[] | null) ?? []).map((row) => ({
    ...row,
    jumlah: toNumber(row.jumlah),
    peratus: toNumber(row.peratus),
  }));
}

/** 'RM5,000.00' — pemisah ribuan kerana angka di sini berjulat sehingga lima digit. */
export function ringgitPipis(amount: number): string {
  const negative = amount < 0;
  const body = Math.abs(amount)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-RM' : 'RM') + body;
}

/**
 * 'RM3,400' — ringgit penuh tanpa sen.
 *
 * Untuk kad sempit di mana amaun berkongsi baris dengan maklumat lain. Sen
 * tidak pernah mengubah jawapan kepada "sejauh mana sumbangan saya", tetapi
 * tiga aksara tambahan itu yang menolak peratus keluar dari kad selebar
 * separuh skrin.
 */
export function ringgitBulat(amount: number): string {
  const negative = amount < 0;
  const body = Math.round(Math.abs(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-RM' : 'RM') + body;
}

/** Nama method untuk dipapar — satu tempat, supaya dua skrin tidak berbeza. */
export function methodLabel(method: PipisContribution['method']): string {
  if (method === 'import') return 'Rekod lejar';
  if (method === 'gateway') return 'Bayaran online';
  return 'Pelarasan';
}

/** '68%' — satu tempat perpuluhan hanya bila ia membawa maklumat. */
export function peratusLabel(peratus: number): string {
  return (Number.isInteger(peratus) ? String(peratus) : peratus.toFixed(1)) + '%';
}
