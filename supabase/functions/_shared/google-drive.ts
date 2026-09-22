/**
 * Perkakas bersama untuk Album Gambar Event (Google Drive Shared Drive).
 *
 * Kredential Google (Service Account) HANYA wujud di sini, dalam persekitaran
 * Edge Function di pelayan Supabase — ia tidak pernah dihantar ke app. Setiap
 * fungsi Edge yang menyentuh Drive (upload/padam/token akses) mengimport fail
 * ini dan bukan menyalin logic JWT/OAuth2, supaya peraturan itu wujud di SATU
 * tempat sahaja.
 *
 * Skop OAuth2 dihadkan kepada `drive.file` — service account HANYA boleh
 * menyentuh fail yang IA SENDIRI cipta, bukan seluruh Drive organisasi. Ini
 * sengaja menghadkan risiko: kalau token access ini bocor (contohnya melalui
 * `get-photo-access-token`), yang terdedah cumalah fail app ini sendiri.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

type ServiceAccount = { client_email: string; private_key: string };

function parseServiceAccount(): ServiceAccount {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON tidak ditetapkan sebagai secret.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang sah.');
  }

  const account = parsed as Partial<ServiceAccount>;
  if (!account.client_email || !account.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON tiada client_email/private_key.');
  }
  return account as ServiceAccount;
}

export function sharedDriveId(): string {
  const id = Deno.env.get('GOOGLE_DRIVE_SHARED_DRIVE_ID');
  if (!id) throw new Error('GOOGLE_DRIVE_SHARED_DRIVE_ID tidak ditetapkan sebagai secret.');
  return id;
}

// --- base64url — Deno tiada helper terbina, dan `btoa`/`atob` asli sahaja tidak cukup untuk JWT ---

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(value: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

/** PEM (PKCS8) → `CryptoKey` — format standard fail `private_key` dalam JSON Service Account Google. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binaryDer = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));

  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Bina & tandatangan JWT (RS256) bagi Service Account, tukar kepada
 * access_token OAuth2 — aliran standard Google "server-to-server" tanpa
 * pengguna terlibat langsung. Token sah ~1 jam; setiap panggilan di sini
 * menjana token BAHARU (tiada cache merentasi permintaan — Edge Function
 * stateless, dan overhead satu panggilan token boleh diabaikan).
 */
export async function getDriveAccessToken(): Promise<string> {
  const account = parseServiceAccount();
  const privateKey = await importPrivateKey(account.private_key);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: account.client_email,
    scope: DRIVE_FILE_SCOPE,
    aud: TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now,
  };

  const signingInput = base64UrlFromString(JSON.stringify(header)) + '.' + base64UrlFromString(JSON.stringify(claims));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  const assertion = signingInput + '.' + base64UrlFromBytes(new Uint8Array(signature));

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error('Gagal mendapatkan token akses Google Drive: ' + (await response.text()));
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Respons token Google Drive tiada access_token.');
  return data.access_token;
}

/** Escape untuk nilai literal dalam query `q=` Drive API (ganda kutip tunggal sahaja perlu). */
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Cari subfolder event sedia ada (nama padan tepat, dalam Shared Drive) atau
 * cipta baharu kalau tiada. Carian dahulu — dan bukan terus cipta — mengelak
 * subfolder pendua kalau `drive_folder_id` belum sempat disimpan pada event
 * (contohnya dua muat naik pertama berlaku serentak).
 */
export async function findOrCreateEventFolder(
  accessToken: string,
  folderName: string,
): Promise<string> {
  const driveId = sharedDriveId();
  const query =
    `name = '${escapeDriveQueryValue(folderName)}' and mimeType = 'application/vnd.google-apps.folder' ` +
    `and '${driveId}' in parents and trashed = false`;

  const searchUrl =
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&corpora=drive&driveId=${driveId}` +
    '&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id)';

  const searchResponse = await fetch(searchUrl, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (searchResponse.ok) {
    const found = (await searchResponse.json()) as { files?: { id: string }[] };
    if (found.files && found.files.length > 0 && found.files[0]) return found.files[0].id;
  }

  const createResponse = await fetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [driveId],
    }),
  });

  if (!createResponse.ok) {
    throw new Error('Gagal mencipta subfolder Drive: ' + (await createResponse.text()));
  }

  const created = (await createResponse.json()) as { id: string };
  return created.id;
}

/**
 * Muat naik satu fail (bait mentah) ke dalam folder Drive — muat naik
 * "multipart" (metadata + kandungan dalam SATU permintaan), sesuai untuk
 * gambar bersaiz sederhana (foto album, bukan video).
 */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<string> {
  const boundary = 'mysaff_' + crypto.randomUUID();
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const encoder = new TextEncoder();

  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });

  if (!response.ok) {
    throw new Error('Gagal muat naik gambar ke Google Drive: ' + (await response.text()));
  }

  const uploaded = (await response.json()) as { id: string };
  return uploaded.id;
}

/** Padam satu fail dari Drive. 404 (sudah tiada) dianggap berjaya — hasil akhirnya sama. */
export async function deleteFileFromDrive(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`${DRIVE_API}/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + accessToken },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error('Gagal memadam gambar dari Google Drive: ' + (await response.text()));
  }
}

/** "[Nama Event] - [Tarikh]" — nama subfolder standard, satu tempat sahaja supaya konsisten. */
export function eventFolderName(eventName: string, eventDate: string): string {
  return eventName + ' - ' + eventDate;
}
