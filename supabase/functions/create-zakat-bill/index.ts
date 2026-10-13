import { GATEWAY_KINDS, serveCreateBill } from '../_shared/toyyibpay.ts';

/**
 * Cipta bil ToyyibPay untuk infaq Tabung Zakat oleh ahli sendiri.
 *
 * Semua logik dikongsi dengan create-pipis-bill / create-yuran-bill dalam
 * `_shared/toyyibpay.ts`. Status bayaran diselaraskan oleh toyyibpay-callback.
 */
Deno.serve((request) => serveCreateBill(request, GATEWAY_KINDS.zakat));
