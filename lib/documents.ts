import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { edgeMessage } from './members';
import { supabase } from './supabase';

/**
 * Library Dokumen ("Arkib") — Google Drive Shared Drive, terbuka kepada semua
 * ahli. Fail SEBENAR tinggal di Drive (folder tetap "Dokumen"); `documents`
 * hanya menyimpan metadata. Muat naik/padam melalui Edge Function
 * (`upload-document`, `delete-document`); muat turun terus dari Google guna
 * token `get-document-access-token` — bait fail tidak melalui pelayan Supabase.
 */

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export type DocumentRow = {
  id: string;
  uploaded_by: string | null;
  drive_file_id: string;
  file_name: string;
  file_size_bytes: number | null;
  category: string | null;
  description: string | null;
  created_at: string;
};

export async function fetchDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data as DocumentRow[] | null) ?? [];
}

// --- Paparan ---------------------------------------------------------------------

export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

/** "24 Sep 2026" — dikira sendiri kerana sokongan Intl locale ms di Hermes tidak dijamin. */
export function formatUploadDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

export type DocumentKind = 'pdf' | 'word' | 'excel' | 'slide' | 'image' | 'other';

export function documentKind(fileName: string): DocumentKind {
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'word';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'excel';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'slide';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return 'image';
  return 'other';
}

// --- Muat naik -------------------------------------------------------------------

export type PickedDocument = {
  uri: string;
  name: string;
  size: number | null;
  mimeType: string | null;
  /** Hanya web — objek `File` pelayar. */
  webFile?: globalThis.File;
};

async function readDocumentBytes(doc: PickedDocument): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    if (doc.webFile) return new Uint8Array(await doc.webFile.arrayBuffer());
    return new Uint8Array(await (await fetch(doc.uri)).arrayBuffer());
  }
  return await new File(doc.uri).bytes();
}

/** base64 dalam ketulan — `String.fromCharCode(...besar)` melimpahkan stack pada fail beberapa MB. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x2000 * 3; // gandaan 3 supaya sambungan base64 tidak berlapik di tengah
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + CHUNK))));
  }
  return parts.join('');
}

export type UploadProgress =
  | { stage: 'membaca' }
  | { stage: 'menghantar'; fraction: number }
  | { stage: 'memproses' };

/**
 * Hantar ke `upload-document`. XMLHttpRequest dan bukan `functions.invoke`
 * kerana hanya XHR memberi kemajuan penghantaran sebenar. Pelayan mengesahkan
 * semula had 20MB, jenis akaun dan segalanya — semakan di sini sekadar
 * kemudahan.
 */
export async function uploadDocument(
  doc: PickedDocument,
  category: string,
  description: string,
  onProgress: (progress: UploadProgress) => void,
): Promise<void> {
  onProgress({ stage: 'membaca' });
  const bytes = await readDocumentBytes(doc);
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('Fail terlalu besar. Had maksimum ialah 20MB.');
  if (bytes.length === 0) throw new Error('Fail kosong.');

  const payload = JSON.stringify({
    file_base64: bytesToBase64(bytes),
    file_name: doc.name,
    mime_type: doc.mimeType ?? 'application/octet-stream',
    category: category.trim() || null,
    description: description.trim() || null,
  });

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sesi tamat. Sila log masuk semula.');

  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!baseUrl || !anonKey) throw new Error('Sambungan Supabase belum disediakan.');

  onProgress({ stage: 'menghantar', fraction: 0 });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', baseUrl + '/functions/v1/upload-document');
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 180_000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress({ stage: 'menghantar', fraction: event.loaded / event.total });
      }
    };
    xhr.upload.onload = () => onProgress({ stage: 'memproses' });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = 'Gagal memuat naik dokumen.';
      try {
        const body = JSON.parse(xhr.responseText) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Badan bukan JSON — guna mesej sandaran.
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Sambungan terputus semasa memuat naik. Sila cuba lagi.'));
    xhr.ontimeout = () => reject(new Error('Muat naik mengambil masa terlalu lama. Sila cuba lagi.'));

    xhr.send(payload);
  });
}

export async function deleteDocument(documentId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-document', { body: { document_id: documentId } });
  if (error) throw new Error(await edgeMessage(error, 'Gagal memadam dokumen.'));
  if (data?.error) throw new Error(String(data.error));
}

// --- Buka / muat turun ---------------------------------------------------------------

async function getDocumentAccessToken(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('get-document-access-token', { body: {} });
  if (error) throw new Error(await edgeMessage(error, 'Gagal mendapatkan capaian dokumen.'));
  if (data?.error) throw new Error(String(data.error));
  return (data as { access_token: string }).access_token;
}

function driveDownloadUrl(driveFileId: string): string {
  return 'https://www.googleapis.com/drive/v3/files/' + driveFileId + '?alt=media&supportsAllDrives=true';
}

/**
 * Muat turun terus dari Google (token dalam header Authorization — kaedah
 * query-string disekat Google) kemudian serahkan kepada OS/pelayar:
 * web = muat turun pelayar, telefon = helaian kongsi/buka dengan app lain.
 * App TIDAK cuba memaparkan PDF/Word sendiri.
 */
export async function openDocument(doc: DocumentRow): Promise<void> {
  const token = await getDocumentAccessToken();
  const url = driveDownloadUrl(doc.drive_file_id);

  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('Gagal memuat turun dokumen (' + response.status + ').');

    const blobUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = doc.file_name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return;
  }

  const folder = new Directory(Paths.cache, 'dokumen');
  if (!folder.exists) folder.create({ intermediates: true });
  const safeName = doc.file_name.replace(/[\\/:*?"<>|]/g, '_');
  const target = new File(folder, doc.id.slice(0, 8) + '-' + safeName);

  const file = await File.downloadFileAsync(url, target, {
    headers: { Authorization: 'Bearer ' + token },
    idempotent: true,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Peranti ini tidak menyokong pembukaan fail luar app.');
  }
  await Sharing.shareAsync(file.uri, { dialogTitle: doc.file_name });
}
