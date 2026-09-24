import { decodeBase64 } from 'jsr:@std/encoding@1/base64';

import { CORS_HEADERS, RequestError, adminClient, json, readJson, requireActiveMember, text } from '../_shared/admin.ts';
import {
  deleteFileFromDrive,
  getDriveAccessToken,
  getOrCreateFixedFolder,
  uploadFileToDrive,
} from '../_shared/google-drive.ts';

/**
 * Muat naik SATU dokumen ke Library Dokumen ("Arkib") — terbuka kepada mana-
 * mana ahli sah (aktif, tidak disekat). Semua dokumen tinggal dalam SATU folder
 * tetap "Dokumen" di Shared Drive (kategori hanyalah label dalam DB).
 *
 * Had 20MB disemak DI SINI pada bait sebenar selepas nyahkod — semakan client
 * hanyalah kemudahan pengguna dan tidak boleh dipercayai.
 */

const LOG_TAG = '[UploadDocument]';
const FOLDER_NAME = 'Dokumen';
const MAX_BYTES = 20 * 1024 * 1024;
// Panjang base64 maksimum bagi 20MB: 4 aksara setiap 3 bait (dibundar naik).
const MAX_BASE64_LENGTH = Math.ceil(MAX_BYTES / 3) * 4;
// Muat naik 20MB ke Google lebih lama daripada had 15s untuk panggilan kecil.
const UPLOAD_TIMEOUT_MS = 90_000;

/** Buang aksara laluan/kawalan supaya nama fail selamat di Drive dan dalam UI. */
function cleanFileName(raw: string | null): string {
  const cleaned = (raw ?? '')
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 200);
  return cleaned || 'dokumen';
}

function cleanMimeType(raw: string | null): string {
  return raw && /^[\w.+-]+\/[\w.+-]+$/.test(raw) && raw.length <= 100 ? raw : 'application/octet-stream';
}

function optionalText(value: string | null, max: number, label: string): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  if (trimmed.length > max) throw new RequestError(label + ' terlalu panjang (maksimum ' + max + ' aksara).');
  return trimmed;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    console.log(LOG_TAG, 'permintaan diterima');
    const callerId = await requireActiveMember(request);

    const body = await readJson(request);
    const fileBase64 = text(body.file_base64);
    const fileName = cleanFileName(text(body.file_name));
    const mimeType = cleanMimeType(text(body.mime_type));
    const category = optionalText(text(body.category), 60, 'Kategori');
    const description = optionalText(text(body.description), 500, 'Penerangan');

    if (!fileBase64) throw new RequestError('file_base64 diperlukan.');
    if (fileBase64.length > MAX_BASE64_LENGTH) throw new RequestError('Fail terlalu besar. Had maksimum ialah 20MB.');

    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(fileBase64);
    } catch {
      throw new RequestError('file_base64 tidak sah.');
    }
    if (bytes.length === 0) throw new RequestError('Fail kosong.');
    if (bytes.length > MAX_BYTES) throw new RequestError('Fail terlalu besar. Had maksimum ialah 20MB.');
    console.log(LOG_TAG, 'fail=' + fileName, 'saiz=' + bytes.length, 'mime=' + mimeType);

    const accessToken = await getDriveAccessToken();
    const folderId = await getOrCreateFixedFolder(accessToken, FOLDER_NAME);
    const driveFileId = await uploadFileToDrive(accessToken, folderId, fileName, mimeType, bytes, UPLOAD_TIMEOUT_MS);
    console.log(LOG_TAG, 'muat naik berjaya, drive_file_id=' + driveFileId);

    const admin = adminClient();
    const { data: inserted, error: insertError } = await admin
      .from('documents')
      .insert({
        uploaded_by: callerId,
        drive_file_id: driveFileId,
        file_name: fileName,
        file_size_bytes: bytes.length,
        category,
        description,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      // Fail sudah di Drive tetapi metadata gagal — buang supaya tiada fail yatim.
      console.error(LOG_TAG, 'INSERT documents gagal, buang fail Drive semula:', insertError?.message);
      await deleteFileFromDrive(accessToken, driveFileId).catch(() => {});
      throw new RequestError('Gagal menyimpan rekod dokumen: ' + (insertError?.message ?? ''), 500);
    }

    console.log(LOG_TAG, 'selesai, document_id=' + inserted.id);
    return json({ document_id: inserted.id, drive_file_id: driveFileId });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    console.error(LOG_TAG, 'ralat tidak dijangka:', caught);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
