import { GATEWAY_KINDS, serveCreateBill } from '../_shared/toyyibpay.ts';

/**
 * Cipta bil ToyyibPay untuk sumbangan PIPIS ASET oleh ahli sendiri.
 *
 * Semua logik (pengesahan ahli dan amaun, baris pending, createBill) dikongsi
 * dengan create-yuran-bill dalam `_shared/toyyibpay.ts`. Status bayaran
 * diselaraskan oleh toyyibpay-callback.
 */
Deno.serve((request) => serveCreateBill(request, GATEWAY_KINDS.pipis));
