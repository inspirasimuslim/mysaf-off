import { CORS_HEADERS, RequestError, adminClient, json, readJson, requireAuthenticatedUser, text } from '../_shared/admin.ts';
import { deleteFileFromDrive, getDriveAccessToken } from '../_shared/google-drive.ts';

/**
 * Padam SATU dokumen — fail di Drive (dibuang ke Tong Sampah) DAN row metadata.
 *
 * Kebenaran disemak SECARA MANUAL di sini (service_role memintas RLS): pemilik
 * sendiri ATAU Super Admin sahaja — sama dengan policy DELETE `documents`.
 * Tiada konsep department untuk dokumen umum.
 */
const LOG_TAG = '[DeleteDocument]';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    const callerId = await requireAuthenticatedUser(request);

    const body = await readJson(request);
    const documentId = text(body.document_id);
    if (!documentId) throw new RequestError('document_id diperlukan.');

    const admin = adminClient();

    const { data: doc, error: docError } = await admin
      .from('documents')
      .select('id, uploaded_by, drive_file_id')
      .eq('id', documentId)
      .maybeSingle();
    if (docError) throw new RequestError('Gagal membaca rekod dokumen.', 500);
    if (!doc) throw new RequestError('Dokumen tidak dijumpai.', 404);

    let allowed = doc.uploaded_by === callerId;
    if (!allowed) {
      const { data: superAdmin } = await admin.rpc('is_super_admin', { uid: callerId });
      allowed = superAdmin === true;
    }
    if (!allowed) throw new RequestError('Anda tiada kebenaran memadam dokumen ini.', 403);

    // Kegagalan Drive menghentikan padam di sini — row DB tidak disentuh.
    try {
      const accessToken = await getDriveAccessToken();
      await deleteFileFromDrive(accessToken, doc.drive_file_id);
    } catch (caught) {
      console.error(LOG_TAG, 'gagal padam fail Drive, row DB TIDAK disentuh:', caught);
      throw new RequestError('Gagal padam dokumen dari storan, cuba lagi.', 502);
    }

    const { error: deleteError } = await admin.from('documents').delete().eq('id', documentId);
    if (deleteError) throw new RequestError('Fail dipadam dari Drive tetapi rekod gagal dipadam: ' + deleteError.message, 500);

    console.log(LOG_TAG, 'selesai, document_id=' + documentId);
    return json({ deleted: true });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    console.error(LOG_TAG, 'ralat tidak dijangka:', caught);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
