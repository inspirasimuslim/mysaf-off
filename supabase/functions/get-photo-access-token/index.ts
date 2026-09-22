import { CORS_HEADERS, RequestError, json, requireAuthenticatedUser } from '../_shared/admin.ts';
import { getDriveAccessToken } from '../_shared/google-drive.ts';

/**
 * Pulangkan SATU access_token Google Drive (skop `drive.file`, luput ~1 jam)
 * kepada mana-mana ahli authenticated — app fetch gambar TERUS dari Google
 * guna token ini (`.../files/{id}?alt=media&access_token=...`), TANPA proxy
 * melalui Supabase. Ini jimat bandwidth Edge Function sepenuhnya: bait imej
 * tidak pernah melalui pelayan Supabase langsung.
 *
 * Risiko token terdedah TERHAD — skop `drive.file` hanya membuka fail yang
 * Service Account SENDIRI cipta (album event ini), bukan Drive penuh sesiapa.
 */
const LOG_TAG = '[GetPhotoAccessToken]';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    console.log(LOG_TAG, 'permintaan diterima');
    await requireAuthenticatedUser(request);

    const accessToken = await getDriveAccessToken();
    console.log(LOG_TAG, 'token dipulangkan');
    return json({ access_token: accessToken, expires_in: 3600 });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    console.error(LOG_TAG, 'ralat tidak dijangka:', caught);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
