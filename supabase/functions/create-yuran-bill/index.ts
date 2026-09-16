import { GATEWAY_KINDS, serveCreateBill } from '../_shared/toyyibpay.ts';

/**
 * Cipta bil ToyyibPay untuk Yuran Tahunan oleh ahli sendiri.
 *
 * Baris pending dimasukkan ke `yuran_payments` bagi tahun semasa (waktu
 * Malaysia). Logik yang sama seperti create-pipis-bill — lihat
 * `_shared/toyyibpay.ts`. Callback: toyyibpay-callback yang sama.
 */
Deno.serve((request) => serveCreateBill(request, GATEWAY_KINDS.yuran));
