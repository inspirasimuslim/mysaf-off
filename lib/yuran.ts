import { supabase } from './supabase';
import { toNumberOrNull, type GatewayStatus } from './toyyibpay';

/**
 * Operasi pangkalan data untuk yuran keahlian.
 *
 * Baki TIDAK pernah disimpan sebagai nombor. Ia dikira daripada dua senarai —
 * apa yang dicaj (`yuran_ledger`) dan apa yang dibayar (`yuran_payments`) —
 * dan pengiraan itu tinggal di pangkalan data, dalam `yuran_member_summary()`.
 * Menyalinnya ke sini bermakna dua tempat boleh memberi dua jawapan berbeza
 * tentang wang seseorang.
 */

/** Baris tahunan seperti dipulangkan oleh `yuran_member_summary()`. */
export type YuranYearRow = {
  year: number;
  amount_due: number;
  total_paid: number;
  baki: number;
  is_opening_balance: boolean;
};

export type YuranSummary = {
  /** Hutang semasa, sudah dilantaikan pada sifar. */
  tertunggak: number;
  /** Lebihan bayaran, bila bayaran melebihi caj. */
  kredit: number;
  /** Setiap tahun yang ada rekod, terawal dahulu. */
  years: YuranYearRow[];
};

/**
 * `year = 0` ialah baris jumlah keseluruhan yang disisipkan oleh RPC — bukan
 * tahun sebenar (kekangan menghadkan tahun kepada 2000–2100).
 */
const TOTAL_ROW_YEAR = 0;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchYuranSummary(memberId: string): Promise<YuranSummary> {
  const { data, error } = await supabase.rpc('yuran_member_summary', { p_member_id: memberId });
  if (error) throw error;

  const rows = ((data as YuranYearRow[] | null) ?? []).map((row) => ({
    year: toNumber(row.year),
    amount_due: toNumber(row.amount_due),
    total_paid: toNumber(row.total_paid),
    baki: toNumber(row.baki),
    is_opening_balance: Boolean(row.is_opening_balance),
  }));

  const total = rows.find((row) => row.year === TOTAL_ROW_YEAR);
  const net = total ? total.baki : 0;

  return {
    // Hutang dan kredit dipisahkan di sini atas sebab yang sama seperti dalam
    // laporan SQL: nombor negatif dalam ruangan "tertunggak" sentiasa disalah
    // baca sebagai hutang.
    tertunggak: Math.max(net, 0),
    kredit: Math.max(-net, 0),
    years: rows.filter((row) => row.year !== TOTAL_ROW_YEAR),
  };
}

export type YuranPayment = {
  id: string;
  year: number;
  /** Kekal 0 bagi bayaran online yang belum disahkan — lihat `displayAmount`. */
  amount: number;
  method: 'import_opening' | 'import' | 'manual_adjustment' | 'gateway';
  /** Import dan pelarasan sentiasa 'success'; hanya 'gateway' boleh lain. */
  status: GatewayStatus;
  requested_amount: number | null;
  gateway_reference: string | null;
  note: string | null;
  created_at: string;
};

/**
 * Sejarah bayaran seorang ahli, terbaharu dahulu.
 *
 * Bacaan terus pada table: RLS sudah membenarkan ahli melihat bayarannya
 * sendiri. Baris pending/gagal DIPAPAR di sini tetapi tidak dikira dalam baki —
 * itu tugas `yuran_member_summary()`.
 */
export async function fetchYuranPayments(memberId: string): Promise<YuranPayment[]> {
  const { data, error } = await supabase
    .from('yuran_payments')
    .select('id, year, amount, method, status, requested_amount, gateway_reference, note, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data as YuranPayment[] | null) ?? []).map((row) => ({
    ...row,
    year: toNumber(row.year),
    amount: toNumber(row.amount),
    requested_amount: toNumberOrNull(row.requested_amount),
    status: row.status ?? 'success',
  }));
}

export function yuranMethodLabel(method: YuranPayment['method']): string {
  if (method === 'gateway') return 'Bayaran online';
  if (method === 'manual_adjustment') return 'Pelarasan';
  return 'Rekod lejar';
}

/** Bilangan baris baharu yang dicipta — 0 bermakna tahun itu sudah dijana. */
export async function generateYuranYear(year: number): Promise<number> {
  const { data, error } = await supabase.rpc('generate_yuran_year', { p_year: year });
  if (error) throw new Error(error.message);
  return toNumber(data);
}

export type ManualAdjustmentInput = {
  memberId: string;
  year: number;
  /** Positif = bayaran atau kredit; negatif = caj tambahan. */
  amount: number;
  note: string | null;
};

export async function addManualAdjustment(input: ManualAdjustmentInput): Promise<void> {
  const { data: session } = await supabase.auth.getUser();

  const { error } = await supabase.from('yuran_payments').insert({
    member_id: input.memberId,
    year: input.year,
    amount: input.amount,
    method: 'manual_adjustment',
    note: input.note,
    created_by: session.user?.id ?? null,
  });

  if (error) throw error;
}

/**
 * Tulis baki permulaan seorang ahli.
 *
 * Melalui RPC dan bukan dua `insert` berasingan supaya kedua-dua tulisan
 * berlaku dalam satu transaksi, dan supaya larian import yang kedua
 * MENGGANTIKAN angka ahli itu dan bukan menambahnya.
 */
export async function importYuranOpening(
  memberId: string,
  year: number,
  amountDue: number,
  paid: number,
): Promise<void> {
  const { error } = await supabase.rpc('import_yuran_opening', {
    p_member_id: memberId,
    p_year: year,
    p_amount_due: amountDue,
    p_paid: paid,
  });

  if (error) throw new Error(error.message);
}

// --- Senarai admin -----------------------------------------------------------

export type YuranReportRow = {
  member_id: string;
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  caj_tahun: number;
  bayar_tahun: number;
  tertunggak: number;
  kredit: number;
  status: string;
};

/**
 * Satu baris setiap ahli, dengan baki KESELURUHAN.
 *
 * Dikongsi oleh skrin senarai admin dan eksport Excel: kedua-duanya menjawab
 * soalan yang sama, jadi keduanya patut mendapat nombor yang sama daripada
 * pertanyaan yang sama.
 */
export async function fetchYuranReport(year: number): Promise<YuranReportRow[]> {
  const { data, error } = await supabase.rpc('yuran_year_report', { p_year: year });
  if (error) throw error;

  return ((data as YuranReportRow[] | null) ?? []).map((row) => ({
    ...row,
    caj_tahun: toNumber(row.caj_tahun),
    bayar_tahun: toNumber(row.bayar_tahun),
    tertunggak: toNumber(row.tertunggak),
    kredit: toNumber(row.kredit),
  }));
}

/** 'RM90.00' — satu tempat untuk format wang, supaya ia sama di setiap skrin. */
export function ringgit(amount: number): string {
  return 'RM' + amount.toFixed(2);
}
