import { CORS_HEADERS, RequestError, adminClient, json, readJson, requireActiveMember, text } from '../_shared/admin.ts';
import {
  deleteFileFromDrive,
  eventFolderName,
  findOrCreateEventFolder,
  getDriveAccessToken,
  uploadFileToDrive,
} from '../_shared/google-drive.ts';

/**
 * Muat naik SATU gambar ke album event — crowd-sourced, mana-mana ahli sah
 * (aktif, tidak disekat) boleh menyumbang, bukan admin sahaja.
 *
 * Subfolder event ("[Nama Event] - [Tarikh]") dicipta SEKALI sahaja, pada
 * muat naik PERTAMA untuk event itu — `drive_folder_id` disimpan pada
 * `usrah_events` selepas itu supaya muat naik seterusnya tidak perlu carian
 * berulang.
 */

const MAX_BASE64_LENGTH = 8_000_000; // ~6MB bait mentah — gambar dimampatkan client-side sebelum sampai sini.

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    const callerId = await requireActiveMember(request);

    const body = await readJson(request);
    const eventId = text(body.event_id);
    const imageBase64 = text(body.image_base64);
    const caption = text(body.caption);

    if (!eventId) throw new RequestError('event_id diperlukan.');
    if (!imageBase64) throw new RequestError('image_base64 diperlukan.');
    if (imageBase64.length > MAX_BASE64_LENGTH) throw new RequestError('Gambar terlalu besar. Sila cuba gambar lain.');

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(imageBase64), (char) => char.charCodeAt(0));
    } catch {
      throw new RequestError('image_base64 tidak sah.');
    }
    if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new RequestError('Gambar mesti format JPEG.');
    }

    const admin = adminClient();

    const { data: event, error: eventError } = await admin
      .from('usrah_events')
      .select('id, name, start_date, drive_folder_id')
      .eq('id', eventId)
      .maybeSingle();
    if (eventError) throw new RequestError('Gagal membaca acara.', 500);
    if (!event) throw new RequestError('Acara tidak dijumpai.', 404);

    const accessToken = await getDriveAccessToken();

    let folderId = event.drive_folder_id as string | null;
    if (!folderId) {
      folderId = await findOrCreateEventFolder(accessToken, eventFolderName(event.name, event.start_date));
      const { error: folderUpdateError } = await admin
        .from('usrah_events')
        .update({ drive_folder_id: folderId })
        .eq('id', eventId);
      if (folderUpdateError) console.error('Gagal simpan drive_folder_id:', folderUpdateError.message);
    }

    const fileName = 'photo-' + Date.now() + '-' + crypto.randomUUID().slice(0, 8) + '.jpg';
    const driveFileId = await uploadFileToDrive(accessToken, folderId, fileName, 'image/jpeg', bytes);

    const { data: inserted, error: insertError } = await admin
      .from('event_photos')
      .insert({ event_id: eventId, uploaded_by: callerId, drive_file_id: driveFileId, caption })
      .select('id')
      .single();

    if (insertError || !inserted) {
      // Fail sudah sampai ke Drive tetapi metadata gagal tersimpan — padam
      // fail itu supaya tiada fail yatim di Drive tanpa rekod DB.
      await deleteFileFromDrive(accessToken, driveFileId).catch(() => {});
      throw new RequestError('Gagal menyimpan rekod gambar: ' + (insertError?.message ?? ''), 500);
    }

    return json({ photo_id: inserted.id, drive_file_id: driveFileId });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    console.error('upload-event-photo:', caught);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
