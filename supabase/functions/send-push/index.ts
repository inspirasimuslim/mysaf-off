import { adminClient } from '../_shared/admin.ts';

/**
 * Hantar notifikasi push yang belum dihantar (`push_outbox`) melalui Expo Push Service.
 *
 * Dipanggil oleh pencetus pangkalan data (pg_net) dengan header `x-push-secret`; tiada pengguna
 * log masuk memanggilnya. Pengesahan ialah rahsia kongsi dalam Vault (`verify_jwt = false` dalam config.toml).
 */
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

Deno.serve(async (request) => {
  const given = request.headers.get('x-push-secret') ?? '';
  const admin = adminClient();
  // Rahsia disimpan dalam Vault pangkalan data (sama yang digunakan pencetus); disemak di DB.
  const { data: valid } = await admin.rpc('push_check_secret', { p_secret: given });
  if (valid !== true) return new Response('Tidak dibenarkan.', { status: 401 });
  let sent = 0;
  let dropped = 0;

  // Ulang sehingga kosong (had 5 pusingan supaya satu panggilan tidak berjalan tanpa henti).
  for (let round = 0; round < 5; round++) {
    const { data: rows, error } = await admin.rpc('push_claim_batch', { p_limit: BATCH });
    if (error) return new Response('Gagal membaca outbox.', { status: 500 });
    if (!rows || rows.length === 0) break;

    const messages: Record<string, unknown>[] = [];
    for (const row of rows as { title: string; body: string; route: string | null; tokens: string[] }[]) {
      for (const token of row.tokens ?? []) {
        messages.push({
          to: token,
          title: row.title,
          body: row.body,
          sound: 'default',
          channelId: 'default',
          priority: 'high',
          data: row.route ? { url: row.route } : {},
        });
      }
    }

    for (let i = 0; i < messages.length; i += BATCH) {
      const chunk = messages.slice(i, i + BATCH);
      try {
        const response = await fetch(EXPO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(chunk),
        });
        const payload = await response.json().catch(() => null);
        const tickets: { status?: string; details?: { error?: string } }[] = payload?.data ?? [];
        const stale: string[] = [];
        tickets.forEach((ticket, index) => {
          if (ticket.status === 'ok') sent += 1;
          else if (ticket.details?.error === 'DeviceNotRegistered') stale.push(String(chunk[index].to));
        });
        if (stale.length > 0) {
          await admin.rpc('push_drop_tokens', { p_tokens: stale });
          dropped += stale.length;
        }
      } catch (caught) {
        console.error('[SendPush] gagal hantar kelompok', caught instanceof Error ? caught.message : caught);
      }
    }
  }

  return new Response(JSON.stringify({ sent, dropped }), { headers: { 'Content-Type': 'application/json' } });
});
