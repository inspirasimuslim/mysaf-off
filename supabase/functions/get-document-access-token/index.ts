import { CORS_HEADERS, RequestError, json, requireActiveMember } from '../_shared/admin.ts';
import { getDriveAccessToken } from '../_shared/google-drive.ts';

/**
 * Pulangkan SATU access_token Google Drive (skop `drive.file`, luput ~1 jam)
 * kepada ahli aktif — app memuat turun dokumen TERUS dari Google guna header
 * `Authorization: Bearer`, tanpa proxy melalui Supabase (sama seperti
 * `get-photo-access-token`). Skop `drive.file` menghadkan risiko kepada fail
 * yang dicipta oleh Service Account ini sendiri.
 */
const LOG_TAG = '[GetDocumentAccessToken]';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    await requireActiveMember(request);

    const accessToken = await getDriveAccessToken();
    console.log(LOG_TAG, 'token dipulangkan');
    return json({ access_token: accessToken, expires_in: 3600 });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    console.error(LOG_TAG, 'ralat tidak dijangka:', caught);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
