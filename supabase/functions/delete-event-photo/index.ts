import { CORS_HEADERS, RequestError, adminClient, json, readJson, requireAuthenticatedUser, text } from '../_shared/admin.ts';
import { deleteFileFromDrive, getDriveAccessToken } from '../_shared/google-drive.ts';

/**
 * Padam SATU gambar — fail SEBENAR di Drive DAN row metadata serentak.
 *
 * Padam fail Drive memerlukan credential Service Account (Edge Function
 * sahaja, bukan client), jadi ia TIDAK boleh berlaku melalui RLS `DELETE`
 * terus dari app seperti row metadata. Kebenaran di sini disemak SECARA
 * MANUAL dan bukan bergantung kepada RLS `event_photos` (yang mengawal
 * metadata sahaja) — sengaja MENGULANGI syarat yang SAMA (pemilik sendiri /
 * admin can_edit department event tu / Super Admin) supaya kedua-dua lapisan
 * (Edge Function ini DAN RLS untuk laluan lain) sentiasa sepakat.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    const callerId = await requireAuthenticatedUser(request);

    const body = await readJson(request);
    const photoId = text(body.photo_id);
    if (!photoId) throw new RequestError('photo_id diperlukan.');

    const admin = adminClient();

    const { data: photo, error: photoError } = await admin
      .from('event_photos')
      .select('id, event_id, uploaded_by, drive_file_id')
      .eq('id', photoId)
      .maybeSingle();
    if (photoError) throw new RequestError('Gagal membaca rekod gambar.', 500);
    if (!photo) throw new RequestError('Gambar tidak dijumpai.', 404);

    const isOwner = photo.uploaded_by === callerId;
    let allowed = isOwner;

    if (!allowed) {
      const { data: superAdmin } = await admin.rpc('is_super_admin', { uid: callerId });
      allowed = superAdmin === true;
    }

    if (!allowed) {
      const { data: canManage } = await admin.rpc('can_manage_event_photo', {
        p_event_id: photo.event_id,
        uid: callerId,
      });
      allowed = canManage === true;
    }

    if (!allowed) {
      throw new RequestError('Anda tiada kebenaran memadam gambar ini.', 403);
    }

    const accessToken = await getDriveAccessToken();
    await deleteFileFromDrive(accessToken, photo.drive_file_id);

    const { error: deleteError } = await admin.from('event_photos').delete().eq('id', photoId);
    if (deleteError) throw new RequestError('Fail dipadam dari Drive tetapi rekod gagal dipadam: ' + deleteError.message, 500);

    return json({ deleted: true });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    console.error('delete-event-photo:', caught);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
