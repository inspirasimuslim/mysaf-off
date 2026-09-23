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
 *
 * SETIAP panggilan `fetch()` ke Google di sini melalui `fetchWithTimeout()` —
 * tanpa had masa eksplisit, satu panggilan Google yang tersekat/tergantung
 * akan menggantung SELURUH permintaan Edge Function sehingga had platform
 * (~150saat) tercapai, dan pengguna melihat spinner tanpa sebarang mesej
 * sepanjang itu. 15 saat cukup lapang untuk keadaan rangkaian biasa tetapi
 * gagal PANTAS dengan mesej jelas bila Google benar-benar tidak menjawab.
 */

const LOG_TAG = '[GoogleDrive]';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const FETCH_TIMEOUT_MS = 15_000;

/** `fetch()` dengan had masa eksplisit — lihat nota di atas fail ini. */
async function fetchWithTimeout(url: string, options: RequestInit, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    console.log(LOG_TAG, 'fetch mula:', label);
    const response = await fetch(url, { ...options, signal: controller.signal });
    console.log(LOG_TAG, 'fetch selesai:', label, response.status);
    return response;
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') {
      console.error(LOG_TAG, 'fetch TAMAT MASA (' + FETCH_TIMEOUT_MS / 1000 + 's):', label);
      throw new Error('Google tidak menjawab dalam masa yang munasabah (' + label + '). Sila cuba lagi.');
    }
    console.error(LOG_TAG, 'fetch gagal:', label, caught);
    throw caught;
  } finally {
    clearTimeout(timer);
  }
}

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

  /*
    `JSON.parse` SEPATUTNYA menukar `\n` (escape) kepada baris baharu sebenar
    secara automatik. TETAPI kalau nilai secret itu sendiri sudah rosak dari
    awal (contohnya disalin/ditetapkan melalui laluan yang meratakan baris
    baharu kepada teks literal DUA aksara `\` + `n` SEBELUM ia sampai ke sini
    sebagai JSON), `private_key` akan mengandungi teks literal itu walaupun
    selepas `JSON.parse`. Ini punca BIASA untuk `crypto.subtle.importKey()`
    gagal atau (lebih teruk) tersangkut secara senyap. `.replace()` di sini
    tidak berbahaya bila `private_key` SUDAH betul (tiada `\n` literal untuk
    dipadan), jadi ia selamat sebagai lapisan pertahanan sahaja.
  */
  const privateKey = account.private_key.includes('\\n') ? account.private_key.replace(/\\n/g, '\n') : account.private_key;

  return { client_email: account.client_email, private_key: privateKey };
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

  if (!body) {
    throw new Error('private_key kosong selepas dibersihkan — semak format GOOGLE_SERVICE_ACCOUNT_JSON.');
  }

  let binaryDer: Uint8Array;
  try {
    binaryDer = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  } catch (caught) {
    console.error(LOG_TAG, 'private_key bukan base64 sah selepas dibersihkan:', caught);
    throw new Error('private_key tidak sah (bukan PEM PKCS8 yang boleh dibaca).');
  }

  try {
    return await crypto.subtle.importKey('pkcs8', binaryDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch (caught) {
    console.error(LOG_TAG, 'crypto.subtle.importKey gagal:', caught);
    throw new Error('Gagal import private_key Service Account — format PEM mungkin rosak.');
  }
}

/**
 * Bina & tandatangan JWT (RS256) bagi Service Account, tukar kepada
 * access_token OAuth2 — aliran standard Google "server-to-server" tanpa
 * pengguna terlibat langsung. Token sah ~1 jam; setiap panggilan di sini
 * menjana token BAHARU (tiada cache merentasi permintaan — Edge Function
 * stateless, dan overhead satu panggilan token boleh diabaikan).
 */
export async function getDriveAccessToken(): Promise<string> {
  console.log(LOG_TAG, 'getDriveAccessToken: mula');
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

  let signature: ArrayBuffer;
  try {
    signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signingInput));
  } catch (caught) {
    console.error(LOG_TAG, 'crypto.subtle.sign gagal:', caught);
    throw new Error('Gagal menandatangan JWT Service Account.');
  }
  const assertion = signingInput + '.' + base64UrlFromBytes(new Uint8Array(signature));

  const response = await fetchWithTimeout(
    TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    },
    'oauth2.googleapis.com/token',
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(LOG_TAG, 'token endpoint pulangkan ralat:', response.status, errorText);
    throw new Error('Gagal mendapatkan token akses Google Drive: ' + errorText);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Respons token Google Drive tiada access_token.');
  console.log(LOG_TAG, 'getDriveAccessToken: berjaya');
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

  const searchResponse = await fetchWithTimeout(
    searchUrl,
    { headers: { Authorization: 'Bearer ' + accessToken } },
    'drive.files.list (cari subfolder)',
  );
  if (searchResponse.ok) {
    const found = (await searchResponse.json()) as { files?: { id: string }[] };
    if (found.files && found.files.length > 0 && found.files[0]) return found.files[0].id;
  } else {
    console.error(LOG_TAG, 'carian subfolder gagal (teruskan ke cipta baharu):', searchResponse.status, await searchResponse.text());
  }

  const createResponse = await fetchWithTimeout(
    `${DRIVE_API}/files?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [driveId],
      }),
    },
    'drive.files.create (subfolder)',
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error(LOG_TAG, 'cipta subfolder gagal:', createResponse.status, errorText);
    throw new Error('Gagal mencipta subfolder Drive: ' + errorText);
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

  const response = await fetchWithTimeout(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body,
    },
    'drive.files.create (upload multipart, ' + Math.round(bytes.length / 1024) + 'KB)',
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(LOG_TAG, 'muat naik gagal:', response.status, errorText);
    throw new Error('Gagal muat naik gambar ke Google Drive: ' + errorText);
  }

  const uploaded = (await response.json()) as { id: string };
  return uploaded.id;
}

/**
 * "Padam" satu fail dari Drive — SEBENARNYA buang ke Tong Sampah (`trashed:
 * true`), BUKAN `DELETE files.delete` (padam kekal).
 *
 * Disahkan LANGSUNG (bukan spekulasi) terhadap Shared Drive sebenar guna
 * token skop `drive.file` yang SAMA seperti Edge Function ini: `DELETE
 * /files/{id}` pulangkan 404 "File not found" WALAUPUN fail itu wujud
 * (`GET` pada ID yang SAMA berjaya 200) — skop `drive.file` tidak cukup
 * untuk padam KEKAL fail dalam Shared Drive, hanya untuk cipta/baca/kemas
 * kini fail yang ia sendiri cipta. `PATCH {trashed: true}` pula BERJAYA
 * (200) di bawah skop SAMA — ini punca SEBENAR bug "row DB hilang, fail
 * Drive kekal ada": kod lama anggap 404 bermakna "dah tiada, jadi ok",
 * padahal 404 itu palsu (sekatan skop, bukan fail benar-benar tiada), row
 * DB terus dipadam manakala fail ASLI kekal wujud tanpa rujukan.
 *
 * Kesan sampingan BAIK: fail masuk Tong Sampah Drive (boleh dipulihkan
 * ~30 hari sebelum luput automatik) dan bukan terus hilang — lebih selamat
 * daripada padam kekal, tanpa perlu longgarkan skop OAuth2 ke `drive` penuh.
 */
export async function deleteFileFromDrive(accessToken: string, fileId: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${DRIVE_API}/files/${fileId}?supportsAllDrives=true&fields=id,trashed`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    },
    'drive.files.update (trash)',
  );

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    console.error(LOG_TAG, 'padam (trash) gagal:', response.status, errorText);
    throw new Error('Gagal memadam gambar dari Google Drive: ' + errorText);
  }
}

/** "[Nama Event] - [Tarikh]" — nama subfolder standard, satu tempat sahaja supaya konsisten. */
export function eventFolderName(eventName: string, eventDate: string): string {
  return eventName + ' - ' + eventDate;
}
