import { CORS_HEADERS, RequestError, adminClient, json, readJson, requireAuthenticatedUser, text } from '../_shared/admin.ts';
import { deleteFileFromDrive, getDriveAccessToken } from '../_shared/google-drive.ts';

/**
 * Padam SELURUH album satu acara — admin can_edit department acara itu, atau
 * Super Admin sahaja (BUKAN pemilik gambar individu — lihat `delete-event-photo`
 * untuk padam satu-satu, yang membenarkan pemilik sendiri juga).
 *
 * Setiap fail Drive dipadam SATU-SATU; kegagalan SATU fail TIDAK menghentikan
 * yang lain. Row DB HANYA dipadam untuk gambar yang fail Drivenya BERJAYA
 * dipadam — gambar yang gagal kekal dalam DB (boleh cuba lagi kemudian, sama
 * ada dengan "Padam Seluruh Album" semula atau padam satu-satu), supaya tiada
 * row hilang tanpa fail Drive turut hilang (prinsip SAMA seperti
 * `delete-event-photo`).
 */
const LOG_TAG = '[DeleteEventAlbum]';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    console.log(LOG_TAG, 'permintaan diterima');
    const callerId = await requireAuthenticatedUser(request);

    const body = await readJson(request);
    const eventId = text(body.event_id);
    if (!eventId) throw new RequestError('event_id diperlukan.');

    const admin = adminClient();

    const { data: event, error: eventError } = await admin
      .from('usrah_events')
      .select('id, event_type')
      .eq('id', eventId)
      .maybeSingle();
    if (eventError) throw new RequestError('Gagal membaca acara.', 500);
    if (!event) throw new RequestError('Acara tidak dijumpai.', 404);

    const { data: superAdmin } = await admin.rpc('is_super_admin', { uid: callerId });
    let allowed = superAdmin === true;

    if (!allowed) {
      const { data: canEdit } = await admin.rpc('can_edit_event', { p_event_type: event.event_type, uid: callerId });
      allowed = canEdit === true;
    }

    if (!allowed) throw new RequestError('Anda tiada kebenaran memadam album ini.', 403);

    const { data: photos, error: photosError } = await admin
      .from('event_photos')
      .select('id, drive_file_id')
      .eq('event_id', eventId);
    if (photosError) throw new RequestError('Gagal membaca senarai gambar.', 500);

    const total = photos?.length ?? 0;
    console.log(LOG_TAG, 'event_id=' + eventId, 'jumlah gambar=' + total);

    if (total === 0) {
      return json({ deleted: 0, failed: 0 });
    }

    const accessToken = await getDriveAccessToken();

    let deleted = 0;
    let failed = 0;
    const deletedIds: string[] = [];

    for (const photo of photos!) {
      try {
        await deleteFileFromDrive(accessToken, photo.drive_file_id);
        deletedIds.push(photo.id);
        deleted++;
      } catch (caught) {
        failed++;
        console.error(LOG_TAG, 'gagal padam fail Drive, photo_id=' + photo.id + ':', caught);
      }
    }

    if (deletedIds.length > 0) {
      const { error: deleteError } = await admin.from('event_photos').delete().in('id', deletedIds);
      if (deleteError) {
        console.error(LOG_TAG, 'fail Drive dipadam tetapi row DB gagal dipadam:', deleteError.message);
        throw new RequestError(
          deleted + ' fail dipadam dari Drive tetapi rekod DB gagal dipadam: ' + deleteError.message,
          500,
        );
      }
    }

    console.log(LOG_TAG, 'selesai, dipadam=' + deleted, 'gagal=' + failed);
    return json({ deleted, failed });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    console.error(LOG_TAG, 'ralat tidak dijangka:', caught);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
