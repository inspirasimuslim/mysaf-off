import { CORS_HEADERS, json } from '../_shared/admin.ts';
import { fromBase64Url, isAllowedReturn, reconcileGatewayPayment, type Outcome } from '../_shared/toyyibpay.ts';

/**
 * Penerima status bayaran ToyyibPay — SATU fungsi untuk setiap jenis bayaran
 * (PIPIS ASET, Yuran Tahunan). Rujukan bil menentukan table mana yang dikemas
 * kini; lihat `reconcileGatewayPayment()`.
 *
 * TIGA pintu masuk, SATU pengesahan:
 *   - POST borang daripada pelayan ToyyibPay (billCallbackUrl / webhook).
 *   - GET  daripada pelayar ahli selepas membayar (billReturnUrl), laluan
 *     `/return/<deep link atau URL web, base64url>` — disahkan, kemudian dialihkan ke app.
 *   - POST JSON `{ order_id }` daripada app ("Semak status"), untuk bil yang
 *     webhooknya lewat atau tidak pernah tiba.
 *
 * TIADA satu pun daripadanya dipercayai. Payload callback ToyyibPay tidak
 * ditandatangani dengan kunci yang hanya kita tahu, dan dua pintu lain boleh
 * dipanggil oleh sesiapa. Yang diambil hanyalah RUJUKAN; status dan amaun
 * sentiasa dibaca semula terus daripada `getBillTransactions` ToyyibPay dengan
 * BillCode yang KITA simpan semasa bil dicipta. Kerana itu fungsi ini selamat
 * dibuka tanpa JWT (verify_jwt = false).
 *
 * Sentiasa 200 kepada ToyyibPay — ralat dilog, dan baris yang tertinggal
 * pending diselaraskan semula oleh pintu GET atau butang "Semak status".
 */

async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get('content-type') ?? '';
  try {
    const out: Record<string, string> = {};
    if (type.includes('application/json')) {
      const body = await request.json();
      for (const [key, value] of Object.entries(body ?? {})) {
        if (typeof value === 'string' || typeof value === 'number') out[key] = String(value);
      }
      return out;
    }
    const form = await request.formData();
    form.forEach((value, key) => {
      if (typeof value === 'string') out[key] = value;
    });
    return out;
  } catch {
    return {};
  }
}

async function safeReconcile(orderId: string | null, billCode: string | null) {
  try {
    return await reconcileGatewayPayment(orderId, billCode);
  } catch (caught) {
    console.error('reconcile gagal', caught);
    return { outcome: 'unknown' as Outcome, table: null };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(request.url);

  // --- Pelayar ahli kembali daripada ToyyibPay --------------------------------
  if (request.method === 'GET') {
    const orderId = url.searchParams.get('order_id');
    const { outcome } = await safeReconcile(orderId, url.searchParams.get('billcode'));

    const encoded = /\/return\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
    const appUrl = encoded ? fromBase64Url(encoded) : null;

    if (appUrl && isAllowedReturn(appUrl)) {
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
  const orderId = params.order_id ?? null;
  const billCode = params.billcode ?? null;

  const { outcome, table } = await safeReconcile(orderId, billCode);

  console.log('toyyibpay-callback', { orderId, billCode, claimed: params.status ?? null, outcome, table });
  return json({ ok: true, status: outcome });
});
