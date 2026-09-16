import { createClient } from 'jsr:@supabase/supabase-js@2';

import { CORS_HEADERS, RequestError, adminClient, json, readJson, text } from './admin.ts';

/**
 * Perkakas bersama integrasi ToyyibPay — satu salinan untuk setiap jenis bayaran.
 *
 * Setiap jenis bayaran (PIPIS, Yuran) ialah SATU entri dalam `GATEWAY_KINDS`.
 * Table-tablenya berkongsi nama kolum yang sama (`amount`, `status`,
 * `requested_amount`, `gateway_reference`, `gateway_bill_code`, `note`), jadi
 * mencipta bil dan menyelaraskan status ialah kod yang sama dengan nama table
 * yang berbeza.
 *
 * Secrets: TOYYIBPAY_SECRET_KEY, TOYYIBPAY_CATEGORY_CODE, TOYYIBPAY_BASE_URL
 * (https://dev.toyyibpay.com untuk sandbox, https://toyyibpay.com untuk live).
 */

export type GatewayStatus = 'pending' | 'success' | 'failed';
export type Outcome = GatewayStatus | 'unknown';

type GatewayKind = {
  table: 'pipis_contributions' | 'yuran_payments';
  billName: string;
  /** Deep link app native. */
  defaultReturn: string;
  /** Laluan app web (tanpa origin), cth. '/pipis'. */
  webPath: string;
  /** Kolum tambahan khusus table ini untuk baris pending. */
  extraRow: () => Record<string, unknown>;
  pendingNote: string | null;
};

/** Tahun semasa waktu Malaysia — bayaran pada 1 Januari 7 pagi ialah tahun baharu. */
function malaysiaYear(): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric' }).format(new Date()));
}

export const GATEWAY_KINDS = {
  pipis: {
    table: 'pipis_contributions',
    billName: 'Sumbangan PIPIS ASET',
    defaultReturn: 'mysafoff://pipis',
    webPath: '/pipis',
    extraRow: () => ({}),
    pendingNote: 'Bayaran online ToyyibPay',
  },
  yuran: {
    table: 'yuran_payments',
    billName: 'Bayaran Yuran Tahunan',
    defaultReturn: 'mysafoff://yuran',
    webPath: '/yuran',
    extraRow: () => ({ year: malaysiaYear() }),
    pendingNote: null,
  },
} satisfies Record<string, GatewayKind>;

/** Urutan carian callback: rujukan UUID hanya wujud dalam satu daripadanya. */
const GATEWAY_TABLES = Object.values(GATEWAY_KINDS).map((kind) => kind.table);

const MIN_AMOUNT = 1;
/** Had FPX individu. Amaun lebih besar lebih wajar melalui pindahan bank terus. */
const MAX_AMOUNT = 30000;
/** Halang ahli (atau skrip) menimbun bil yang tidak dibayar. */
const MAX_PENDING_PER_HOUR = 10;
/** Tempoh bil sah di ToyyibPay. Selepas ini bil pending tanpa bayaran ditanda gagal. */
const BILL_EXPIRY_DAYS = 3;

/** Deep link yang dibenarkan untuk kembali ke app — bukan pengalihan terbuka. */
export const APP_RETURN_PATTERN = /^(mysafoff|exp|exps):\/\/[^\s]{0,250}$/;

/** App web yang dihos. Pelayar tidak boleh "kembali" ke deep link `mysafoff://`. */
const DEFAULT_WEB_ORIGIN = 'https://mysaff.vercel.app';

/**
 * Origin web yang dibenarkan sebagai destinasi kembali — senarai tetap, bukan
 * pengalihan terbuka. `APP_WEB_ORIGINS` (dipisah koma) menambah origin lain,
 * cth. domain sendiri kelak. localhost dibenarkan untuk `expo start --web`.
 */
function webOrigins(): string[] {
  const extra = (Deno.env.get('APP_WEB_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [DEFAULT_WEB_ORIGIN, ...extra];
}

function isWebReturn(value: string): boolean {
  if (value.length > 300 || /\s/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true;
  return url.protocol === 'https:' && webOrigins().includes(url.origin);
}

/** Destinasi kembali yang selamat untuk dialihkan: deep link app ATAU URL app web yang disenarai. */
export function isAllowedReturn(value: string): boolean {
  return APP_RETURN_PATTERN.test(value) || isWebReturn(value);
}

export function toyyibpayBaseUrl(): string {
  return (Deno.env.get('TOYYIBPAY_BASE_URL') ?? 'https://dev.toyyibpay.com').replace(/\/+$/, '');
}

/** ToyyibPay hanya menerima huruf, nombor, ruang dan '_' dalam nama/keterangan bil. */
function billText(value: string, max: number): string {
  return value
    .replace(/[^A-Za-z0-9 _]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

async function requireCaller(request: Request): Promise<{ id: string; email: string | null }> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    throw new RequestError('Token akses tiada. Sila log masuk semula.', 401);
  }

  const caller = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );

  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) throw new RequestError('Sesi tidak sah. Sila log masuk semula.', 401);

  return { id: data.user.id, email: data.user.email ?? null };
}

// =============================================================================
// CIPTA BIL
// =============================================================================

/**
 * Pengendali penuh untuk `create-<jenis>-bill`.
 *
 * Baris dimasukkan DAHULU (amount 0, status 'pending') dan barulah ToyyibPay
 * dipanggil: kalau bil wujud tetapi baris gagal ditulis, bayaran yang masuk
 * tiada tempat untuk dipadankan. Amaun sebenar TIDAK ditulis di sini — hanya
 * `reconcileGatewayPayment()`, selepas bertanya ToyyibPay, boleh berbuat begitu.
 */
export async function serveCreateBill(request: Request, kind: GatewayKind): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    const secretKey = Deno.env.get('TOYYIBPAY_SECRET_KEY');
    const categoryCode = Deno.env.get('TOYYIBPAY_CATEGORY_CODE');
    if (!secretKey || !categoryCode) {
      throw new RequestError('Bayaran online belum dikonfigurasi. Hubungi pentadbir.', 503);
    }

    const user = await requireCaller(request);
    const body = await readJson(request);

    // --- Amaun: disahkan di pelayan, app hanya mencadangkan ---------------
    const rawAmount = typeof body.amount === 'string' ? Number.parseFloat(body.amount) : Number(body.amount);
    if (!Number.isFinite(rawAmount)) throw new RequestError('Amaun tidak sah.');
    const amount = Math.round(rawAmount * 100) / 100;
    if (amount < MIN_AMOUNT) throw new RequestError('Amaun minimum ialah RM1.00.');
    if (amount > MAX_AMOUNT) throw new RequestError('Amaun maksimum satu bayaran online ialah RM30,000.');
    const amountSen = Math.round(amount * 100);

    /*
      Platform pemanggil menentukan ke mana pelayar kembali selepas membayar:
      native → deep link app; web → URL sebenar app web (pelayar tidak boleh
      membuka `mysafoff://`). Nilai yang tidak disenarai jatuh ke lalai platform.
    */
    const platform = text(body.platform) === 'web' ? 'web' : 'native';
    const requestedReturn = text(body.return_url);
    const appReturn =
      platform === 'web'
        ? requestedReturn && isWebReturn(requestedReturn)
          ? requestedReturn
          : DEFAULT_WEB_ORIGIN + kind.webPath
        : requestedReturn && APP_RETURN_PATTERN.test(requestedReturn)
          ? requestedReturn
          : kind.defaultReturn;

    const admin = adminClient();

    // --- Pemanggil mesti ahli yang aktif --------------------------------------
    const { data: member, error: memberError } = await admin
      .from('members')
      .select('id, full_name, nombor_ahli, email, no_tel, disekat, must_change_password')
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) throw new RequestError('Gagal membaca rekod ahli.', 500);
    if (!member) throw new RequestError('Akaun anda belum dipautkan dengan rekod ahli.', 403);
    if (member.disekat) throw new RequestError('Akaun anda disekat. Hubungi pentadbir.', 403);
    if (member.must_change_password) {
      throw new RequestError('Sila tukar kata laluan sementara anda dahulu.', 403);
    }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from(kind.table)
      .select('id', { count: 'exact', head: true })
      .eq('member_id', member.id)
      .eq('method', 'gateway')
      .eq('status', 'pending')
      .gte('created_at', since);

    if (countError) throw new RequestError('Gagal menyemak bil sedia ada.', 500);
    if ((count ?? 0) >= MAX_PENDING_PER_HOUR) {
      throw new RequestError('Terlalu banyak bil belum selesai. Cuba lagi sebentar lagi.', 429);
    }

    // --- 1. Baris pending dahulu -------------------------------------------
    const reference = crypto.randomUUID();

    const { data: row, error: insertError } = await admin
      .from(kind.table)
      .insert({
        ...kind.extraRow(),
        member_id: member.id,
        amount: 0,
        requested_amount: amount,
        method: 'gateway',
        status: 'pending',
        gateway_reference: reference,
        note: kind.pendingNote,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError || !row) {
      console.error('Gagal memasukkan baris pending', kind.table, insertError?.message);
      throw new RequestError('Gagal merekod bil bayaran.', 500);
    }

    // --- 2. Bil ToyyibPay --------------------------------------------------
    const functionsUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '') + '/functions/v1';
    const baseUrl = toyyibpayBaseUrl();

    const form = new URLSearchParams({
      userSecretKey: secretKey,
      categoryCode,
      billName: billText(kind.billName, 30),
      billDescription: billText(
        (member.full_name ?? 'Ahli') + (member.nombor_ahli ? ' No Ahli ' + member.nombor_ahli : ''),
        100,
      ),
      billPriceSetting: '1',
      // 1 = halaman ToyyibPay meminta maklumat pembayar, diisi awal di bawah.
      billPayorInfo: '1',
      billAmount: String(amountSen),
      // Kembali melalui toyyibpay-callback: ia mengesahkan status dahulu, kemudian
      // mengalihkan ke deep link app (atau URL app web). Destinasi dikodkan dalam laluan dan bukan
      // query kerana ToyyibPay menambah `?status_id=...` sendiri.
      billReturnUrl: functionsUrl + '/toyyibpay-callback/return/' + base64Url(appReturn),
      billCallbackUrl: functionsUrl + '/toyyibpay-callback',
      billExternalReferenceNo: reference,
      billTo: billText(member.full_name ?? '', 100),
      billEmail: member.email ?? user.email ?? '',
      billPhone: String(member.no_tel ?? '').replace(/\D/g, ''),
      billPaymentChannel: '2',
      billChargeToCustomer: '',
      billExpiryDays: String(BILL_EXPIRY_DAYS),
    });

    let billCode: string | null = null;
    let failure = 'Tiada respons';

    try {
      const response = await fetch(baseUrl + '/index.php/api/createBill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      const raw = await response.text();
      failure = raw.slice(0, 200);
      try {
        const parsed = JSON.parse(raw);
        const code = Array.isArray(parsed) ? parsed[0]?.BillCode : null;
        if (typeof code === 'string' && code.trim() !== '') billCode = code.trim();
      } catch {
        // Ralat ToyyibPay kadang-kadang teks biasa, cth. [KEY-DID-NOT-EXIST-OR-USER-IS-NOT-ACTIVE].
      }
    } catch (caught) {
      failure = caught instanceof Error ? caught.message : String(caught);
    }

    if (!billCode) {
      console.error('createBill gagal:', failure);
      await admin
        .from(kind.table)
        .update({ status: 'failed', note: 'Bil ToyyibPay gagal dicipta' })
        .eq('id', row.id);
      throw new RequestError('Gagal mencipta bil ToyyibPay. Cuba lagi sebentar lagi.', 502);
    }

    const { error: codeError } = await admin.from(kind.table).update({ gateway_bill_code: billCode }).eq('id', row.id);
    if (codeError) console.error('Gagal menyimpan BillCode', billCode, codeError.message);

    return json({ bill_code: billCode, payment_url: baseUrl + '/' + billCode, reference, amount });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    console.error(caught);
    return json({ error: 'Ralat pelayan.' }, 500);
  }
}

// =============================================================================
// SELARASKAN STATUS
// =============================================================================

type BillTransaction = {
  billpaymentStatus?: string | number;
  billpaymentAmount?: string | number;
  billExternalReferenceNo?: string;
  billpaymentInvoiceNo?: string;
};

type GatewayRow = {
  id: string;
  status: GatewayStatus;
  requested_amount: number | string | null;
  created_at: string;
  gateway_bill_code: string | null;
};

async function fetchTransactions(billCode: string): Promise<BillTransaction[]> {
  const response = await fetch(toyyibpayBaseUrl() + '/index.php/api/getBillTransactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      userSecretKey: Deno.env.get('TOYYIBPAY_SECRET_KEY') ?? '',
      billCode,
    }),
  });

  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BillTransaction[]) : [];
  } catch {
    // Bil tanpa sebarang transaksi dipulangkan sebagai teks, bukan senarai kosong.
    console.log('getBillTransactions bukan JSON untuk', billCode, raw.slice(0, 120));
    return [];
  }
}

/**
 * Selaraskan satu bayaran dengan status sebenar di ToyyibPay. Idempotent.
 *
 * Rujukan dicari dalam setiap table gateway mengikut urutan; hanya table yang
 * MEMEGANG rujukan itu dikemas kini. UUID dijana oleh `serveCreateBill()` dan
 * setiap table mempunyai indeks unik atas `gateway_reference`.
 */
export async function reconcileGatewayPayment(
  orderId: string | null,
  billCodeHint: string | null,
): Promise<{ outcome: Outcome; table: string | null }> {
  if (!orderId) return { outcome: 'unknown', table: null };

  const admin = adminClient();

  let table: string | null = null;
  let row: GatewayRow | null = null;

  for (const candidate of GATEWAY_TABLES) {
    const { data, error } = await admin
      .from(candidate)
      .select('id, status, requested_amount, gateway_bill_code, created_at')
      .eq('method', 'gateway')
      .eq('gateway_reference', orderId)
      .maybeSingle();

    if (error) {
      console.error('Gagal membaca', candidate, orderId, error.message);
      return { outcome: 'unknown', table: null };
    }
    if (data) {
      table = candidate;
      row = data as GatewayRow;
      break;
    }
  }

  if (!table || !row) {
    console.warn('Rujukan tidak dikenali:', orderId);
    return { outcome: 'unknown', table: null };
  }

  const current = { outcome: row.status as Outcome, table };
  if (row.status === 'success') return current;

  if (row.gateway_bill_code && billCodeHint && row.gateway_bill_code !== billCodeHint) {
    console.warn('BillCode tidak sepadan untuk', orderId, billCodeHint);
    return current;
  }

  /*
    BillCode yang disimpan diutamakan. Petunjuk daripada permintaan hanya
    digunakan jika penyimpanan BillCode gagal selepas bil dicipta — dan pada
    ketika itu transaksi mesti membawa rujukan kita sendiri.
  */
  const billCode = row.gateway_bill_code ?? billCodeHint;
  if (!billCode) return current;

  let transactions: BillTransaction[];
  try {
    transactions = await fetchTransactions(billCode);
  } catch (caught) {
    console.error('getBillTransactions gagal', billCode, caught);
    return current;
  }

  const ours = transactions.filter(
    (tx) => !tx.billExternalReferenceNo || tx.billExternalReferenceNo === orderId,
  );
  if (!row.gateway_bill_code && !ours.some((tx) => tx.billExternalReferenceNo === orderId)) {
    return current;
  }

  const paid = ours.find((tx) => String(tx.billpaymentStatus) === '1');

  if (paid) {
    const amount = Math.round(Number.parseFloat(String(paid.billpaymentAmount ?? '0')) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      console.error('Amaun transaksi tidak sah', billCode, paid.billpaymentAmount);
      return current;
    }
    if (row.requested_amount !== null && Number(row.requested_amount) !== amount) {
      console.warn('Amaun dibayar berbeza daripada diminta', orderId, row.requested_amount, amount);
    }

    const { error: updateError } = await admin
      .from(table)
      .update({
        amount,
        status: 'success',
        gateway_bill_code: billCode,
        note: 'Bayaran online ToyyibPay' + (paid.billpaymentInvoiceNo ? ' · ' + paid.billpaymentInvoiceNo : ''),
      })
      .eq('id', row.id)
      .neq('status', 'success');

    if (updateError) {
      console.error('Gagal mengemas kini success', table, orderId, updateError.message);
      return current;
    }
    return { outcome: 'success', table };
  }

  const stillPending = ours.some((tx) => ['2', '4'].includes(String(tx.billpaymentStatus)));
  const failed = ours.some((tx) => String(tx.billpaymentStatus) === '3');

  /*
    Tiada transaksi langsung = ahli belum membayar (atau menutup halaman).
    Itu kekal pending — bil ToyyibPay masih boleh dibayar sehingga tamat tempoh.
    Hanya kegagalan yang DIREKOD ToyyibPay, atau bil yang sudah melepasi tempoh
    sahnya (dengan sehari kelonggaran), menjadikannya 'failed'.

    'failed' — termasuk yang dibatalkan oleh ahli dalam app — BUKAN muktamad:
    cabang `paid` di atas tetap menukarnya kepada 'success' bila ToyyibPay
    mengesahkan bayaran. Data ToyyibPay ialah punca kebenaran terakhir.
  */
  const expired =
    Date.now() - new Date(row.created_at).getTime() > (BILL_EXPIRY_DAYS + 1) * 24 * 60 * 60 * 1000;

  if ((failed || expired) && !stillPending && row.status === 'pending') {
    const { error: updateError } = await admin
      .from(table)
      .update({
        status: 'failed',
        gateway_bill_code: billCode,
        ...(failed ? {} : { note: 'Bil tamat tempoh' }),
      })
      .eq('id', row.id)
      .eq('status', 'pending');
    if (updateError) console.error('Gagal mengemas kini failed', table, orderId, updateError.message);
    return { outcome: 'failed', table };
  }

  return current;
}
