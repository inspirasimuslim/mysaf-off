import { CORS_HEADERS, adminClient, json } from '../_shared/admin.ts';

/**
 * Penerima status bayaran ToyyibPay bagi sumbangan PIPIS ASET.
 *
 * TIGA pintu masuk, SATU pengesahan:
 *   - POST borang daripada pelayan ToyyibPay (billCallbackUrl / webhook).
 *   - GET  daripada pelayar ahli selepas membayar (billReturnUrl), laluan
 *     `/return/<deep link base64url>` — disahkan, kemudian dialihkan ke app.
 *   - POST JSON `{ order_id }` daripada app ("Semak status"), untuk bil yang
 *     webhooknya lewat atau tidak pernah tiba.
 *
 * TIADA satu pun daripadanya dipercayai. Payload callback ToyyibPay tidak
 * ditandatangani dengan kunci yang hanya kita tahu, dan dua pintu lain boleh
 * dipanggil oleh sesiapa. Yang diambil hanyalah RUJUKAN; status dan amaun
 * sentiasa dibaca semula terus daripada `getBillTransactions` ToyyibPay dengan
 * BillCode yang KITA simpan semasa bil dicipta. Kerana itu fungsi ini selamat
 * dibuka tanpa JWT (verify_jwt = false): memanggilnya hanya menyelaraskan
 * pangkalan data dengan kebenaran di ToyyibPay.
 *
 * Sentiasa 200 kepada ToyyibPay — ralat dilog, dan baris yang tertinggal
 * pending diselaraskan semula oleh pintu GET atau butang "Semak status".
 */

type Outcome = 'success' | 'pending' | 'failed' | 'unknown';

type BillTransaction = {
  billpaymentStatus?: string | number;
  billpaymentAmount?: string | number;
  billExternalReferenceNo?: string;
  billpaymentInvoiceNo?: string;
};

const APP_RETURN_PATTERN = /^(mysafoff|exp|exps):\/\/[^\s]{0,250}$/;

function toyyibpayBaseUrl(): string {
  return (Deno.env.get('TOYYIBPAY_BASE_URL') ?? 'https://dev.toyyibpay.com').replace(/\/+$/, '');
}

function fromBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

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

/** Selaraskan satu baris dengan status sebenar di ToyyibPay. Idempotent. */
async function reconcile(orderId: string | null, billCodeHint: string | null): Promise<Outcome> {
  if (!orderId) return 'unknown';

  const admin = adminClient();
  const { data: row, error } = await admin
    .from('pipis_contributions')
    .select('id, status, requested_amount, gateway_bill_code')
    .eq('method', 'gateway')
    .eq('gateway_reference', orderId)
    .maybeSingle();

  if (error) {
    console.error('Gagal membaca baris', orderId, error.message);
    return 'unknown';
  }
  if (!row) {
    console.warn('Rujukan tidak dikenali:', orderId);
    return 'unknown';
  }
  if (row.status === 'success') return 'success';

  if (row.gateway_bill_code && billCodeHint && row.gateway_bill_code !== billCodeHint) {
    console.warn('BillCode tidak sepadan untuk', orderId, billCodeHint);
    return row.status as Outcome;
  }

  /*
    BillCode yang disimpan diutamakan. Petunjuk daripada permintaan hanya
    digunakan jika penyimpanan BillCode gagal selepas bil dicipta — dan pada
    ketika itu setiap transaksi masih mesti membawa rujukan kita sendiri.
  */
  const billCode = row.gateway_bill_code ?? billCodeHint;
  if (!billCode) return row.status as Outcome;

  let transactions: BillTransaction[];
  try {
    transactions = await fetchTransactions(billCode);
  } catch (caught) {
    console.error('getBillTransactions gagal', billCode, caught);
    return row.status as Outcome;
  }

  const ours = transactions.filter(
    (tx) => !tx.billExternalReferenceNo || tx.billExternalReferenceNo === orderId,
  );
  if (!row.gateway_bill_code && !ours.some((tx) => tx.billExternalReferenceNo === orderId)) {
    return row.status as Outcome;
  }

  const paid = ours.find((tx) => String(tx.billpaymentStatus) === '1');

  if (paid) {
    const amount = Math.round(Number.parseFloat(String(paid.billpaymentAmount ?? '0')) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      console.error('Amaun transaksi tidak sah', billCode, paid.billpaymentAmount);
      return row.status as Outcome;
    }
    if (row.requested_amount !== null && Number(row.requested_amount) !== amount) {
      console.warn('Amaun dibayar berbeza daripada diminta', orderId, row.requested_amount, amount);
    }

    const { error: updateError } = await admin
      .from('pipis_contributions')
      .update({
        amount,
        status: 'success',
        gateway_bill_code: billCode,
        note: 'Bayaran online ToyyibPay' + (paid.billpaymentInvoiceNo ? ' · ' + paid.billpaymentInvoiceNo : ''),
      })
      .eq('id', row.id)
      .neq('status', 'success');

    if (updateError) {
      console.error('Gagal mengemas kini success', orderId, updateError.message);
      return row.status as Outcome;
    }
    return 'success';
  }

  const stillPending = ours.some((tx) => ['2', '4'].includes(String(tx.billpaymentStatus)));
  const failed = ours.some((tx) => String(tx.billpaymentStatus) === '3');

  /*
    Tiada transaksi langsung = ahli belum membayar (atau menutup halaman).
    Itu kekal pending — halaman bil ToyyibPay masih boleh dibayar sehingga
    tamat tempoh. Hanya kegagalan yang DIREKOD ToyyibPay menjadikannya 'failed',
    dan 'failed' masih boleh menjadi 'success' jika ahli mencuba semula bil sama.
  */
  if (failed && !stillPending && row.status === 'pending') {
    const { error: updateError } = await admin
      .from('pipis_contributions')
      .update({ status: 'failed', gateway_bill_code: billCode })
      .eq('id', row.id)
      .eq('status', 'pending');
    if (updateError) console.error('Gagal mengemas kini failed', orderId, updateError.message);
    return 'failed';
  }

  return row.status as Outcome;
}

async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const body = await request.json();
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(body ?? {})) {
        if (typeof value === 'string' || typeof value === 'number') out[key] = String(value);
      }
      return out;
    }
    const form = await request.formData();
    const out: Record<string, string> = {};
    form.forEach((value, key) => {
      if (typeof value === 'string') out[key] = value;
    });
    return out;
  } catch {
    return {};
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(request.url);

  // --- Pelayar ahli kembali daripada ToyyibPay --------------------------------
  if (request.method === 'GET') {
    const orderId = url.searchParams.get('order_id');
    const billCode = url.searchParams.get('billcode');

    let outcome: Outcome = 'unknown';
    try {
      outcome = await reconcile(orderId, billCode);
    } catch (caught) {
      console.error('reconcile (return) gagal', caught);
    }

    const encoded = /\/return\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
    const appUrl = encoded ? fromBase64Url(encoded) : null;

    if (appUrl && APP_RETURN_PATTERN.test(appUrl)) {
      const target =
        appUrl +
        (appUrl.includes('?') ? '&' : '?') +
        new URLSearchParams({ payment: outcome, ref: orderId ?? '' }).toString();
      return new Response(null, { status: 302, headers: { Location: target } });
    }

    return new Response('Status bayaran: ' + outcome + '. Sila kembali ke app MySAFF.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (request.method !== 'POST') return new Response('OK', { status: 200 });

  // --- Webhook ToyyibPay atau "Semak status" daripada app --------------------
  const params = await readParams(request);
  const orderId = params.order_id ?? params.refno_external ?? null;
  const billCode = params.billcode ?? params.bill_code ?? null;

  let outcome: Outcome = 'unknown';
  try {
    outcome = await reconcile(orderId, billCode);
  } catch (caught) {
    console.error('reconcile gagal', caught);
  }

  console.log('toyyibpay-callback', { orderId, billCode, claimed: params.status ?? null, outcome });
  return json({ ok: true, status: outcome });
});
