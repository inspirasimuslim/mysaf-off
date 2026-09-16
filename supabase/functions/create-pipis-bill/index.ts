import { createClient } from 'jsr:@supabase/supabase-js@2';

import { CORS_HEADERS, RequestError, adminClient, json, readJson, text } from '../_shared/admin.ts';

/**
 * Cipta bil ToyyibPay untuk sumbangan PIPIS ASET oleh ahli sendiri.
 *
 * Baris `pipis_contributions` dimasukkan DAHULU (amount 0, status 'pending')
 * dan barulah ToyyibPay dipanggil. Susunan ini disengajakan: kalau bil sudah
 * wujud tetapi baris gagal ditulis, bayaran yang masuk tiada tempat untuk
 * dipadankan. Baris pending yang bilnya gagal dicipta hanya ditanda 'failed'.
 *
 * Amaun sebenar TIDAK ditulis di sini. Hanya `toyyibpay-callback`, selepas
 * bertanya semula kepada pelayan ToyyibPay, yang boleh menukar baris kepada
 * 'success' dengan amaun yang benar-benar dibayar.
 *
 * Secrets: TOYYIBPAY_SECRET_KEY, TOYYIBPAY_CATEGORY_CODE, TOYYIBPAY_BASE_URL
 * (https://dev.toyyibpay.com untuk sandbox, https://toyyibpay.com untuk live).
 */

const MIN_AMOUNT = 1;
/** Had FPX individu. Amaun lebih besar lebih wajar melalui pindahan bank terus. */
const MAX_AMOUNT = 30000;
/** Halang ahli (atau skrip) menimbun bil yang tidak dibayar. */
const MAX_PENDING_PER_HOUR = 10;

/** Deep link yang dibenarkan untuk kembali ke app — bukan pengalihan terbuka. */
const APP_RETURN_PATTERN = /^(mysafoff|exp|exps):\/\/[^\s]{0,250}$/;
const DEFAULT_APP_RETURN = 'mysafoff://pipis';

function toyyibpayBaseUrl(): string {
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

Deno.serve(async (request) => {
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

    const requestedReturn = text(body.return_url);
    const appReturn = requestedReturn && APP_RETURN_PATTERN.test(requestedReturn) ? requestedReturn : DEFAULT_APP_RETURN;

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
      .from('pipis_contributions')
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
      .from('pipis_contributions')
      .insert({
        member_id: member.id,
        amount: 0,
        requested_amount: amount,
        method: 'gateway',
        status: 'pending',
        gateway_reference: reference,
        note: 'Bayaran online ToyyibPay',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError || !row) throw new RequestError('Gagal merekod bil sumbangan.', 500);

    // --- 2. Bil ToyyibPay --------------------------------------------------
    const functionsUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '') + '/functions/v1';
    const baseUrl = toyyibpayBaseUrl();

    const form = new URLSearchParams({
      userSecretKey: secretKey,
      categoryCode,
      billName: 'Sumbangan PIPIS ASET',
      billDescription: billText(
        (member.full_name ?? 'Ahli') + (member.nombor_ahli ? ' No Ahli ' + member.nombor_ahli : ''),
        100,
      ),
      billPriceSetting: '1',
      // 1 = halaman ToyyibPay meminta maklumat pembayar, diisi awal di bawah.
      billPayorInfo: '1',
      billAmount: String(amountSen),
      // Kembali melalui toyyibpay-callback: ia mengesahkan status dahulu, kemudian
      // mengalihkan ke deep link app. Deep link dikodkan dalam laluan dan bukan
      // query kerana ToyyibPay menambah `?status_id=...` sendiri.
      billReturnUrl: functionsUrl + '/toyyibpay-callback/return/' + base64Url(appReturn),
      billCallbackUrl: functionsUrl + '/toyyibpay-callback',
      billExternalReferenceNo: reference,
      billTo: billText(member.full_name ?? '', 100),
      billEmail: member.email ?? user.email ?? '',
      billPhone: String(member.no_tel ?? '').replace(/\D/g, ''),
      billPaymentChannel: '2',
      billChargeToCustomer: '',
      billExpiryDays: '3',
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
        .from('pipis_contributions')
        .update({ status: 'failed', note: 'Bil ToyyibPay gagal dicipta' })
        .eq('id', row.id);
      throw new RequestError('Gagal mencipta bil ToyyibPay. Cuba lagi sebentar lagi.', 502);
    }

    const { error: codeError } = await admin
      .from('pipis_contributions')
      .update({ gateway_bill_code: billCode })
      .eq('id', row.id);
    if (codeError) console.error('Gagal menyimpan BillCode', billCode, codeError.message);

    return json({
      bill_code: billCode,
      payment_url: baseUrl + '/' + billCode,
      reference,
      amount,
    });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    console.error(caught);
    return json({ error: 'Ralat pelayan.' }, 500);
  }
});
