#!/usr/bin/env node
// Uji logic JWT (RS256) + OAuth2 Service Account Google SECARA BERASINGAN —
// TANPA perlu deploy Edge Function. Sahkan access_token sah SEBELUM ulang
// pusingan test-deploy-gagal dalam app.
//
// Guna:
//   node scripts/test-google-drive-auth.mjs path/ke/service-account.json
//   node scripts/test-google-drive-auth.mjs   (baca env var GOOGLE_SERVICE_ACCOUNT_JSON)
//
// Logic di sini SENGAJA disalin selari dengan
// supabase/functions/_shared/google-drive.ts (bukan diimport — Deno vs Node
// runtime berbeza) supaya kedua-dua tempat diuji dengan kod yang SAMA
// bentuknya. Kalau skrip ini ubah caranya, tukar bersama fail Edge Function.

import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

function readServiceAccountJson() {
  const filePath = process.argv[2];
  if (filePath) return readFileSync(filePath, 'utf8');

  const fromEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (fromEnv) return fromEnv;

  console.error('Ralat: beri laluan fail JSON Service Account, atau tetapkan env var GOOGLE_SERVICE_ACCOUNT_JSON.');
  console.error('Guna: node scripts/test-google-drive-auth.mjs path/ke/service-account.json');
  process.exit(1);
}

function base64UrlFromBytes(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(value) {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

async function importPrivateKey(pem) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  if (!body) throw new Error('private_key kosong selepas dibersihkan.');

  const binaryDer = Buffer.from(body, 'base64');
  return await webcrypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function main() {
  console.log('1. Membaca & parse GOOGLE_SERVICE_ACCOUNT_JSON...');
  const raw = readServiceAccountJson();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (caught) {
    console.error('   GAGAL: bukan JSON yang sah —', caught.message);
    process.exit(1);
  }

  const { client_email: clientEmail, private_key: privateKeyRaw } = parsed;
  if (!clientEmail || !privateKeyRaw) {
    console.error('   GAGAL: JSON tiada client_email/private_key.');
    process.exit(1);
  }
  console.log('   OK — client_email:', clientEmail);

  const hadLiteralBackslashN = privateKeyRaw.includes('\\n');
  console.log(
    '2. Semak private_key ada literal "\\\\n"...',
    hadLiteralBackslashN ? 'YA (akan dibetulkan — ini PUNCA biasa JWT gagal senyap)' : 'TIDAK (sudah baris baharu sebenar, OK)',
  );
  const privateKey = hadLiteralBackslashN ? privateKeyRaw.replace(/\\n/g, '\n') : privateKeyRaw;

  console.log('3. Import private_key (PKCS8) ke Web Crypto API...');
  let cryptoKey;
  try {
    cryptoKey = await importPrivateKey(privateKey);
  } catch (caught) {
    console.error('   GAGAL:', caught.message);
    console.error('   Semak format private_key — mesti PEM PKCS8 penuh (-----BEGIN PRIVATE KEY-----...).');
    process.exit(1);
  }
  console.log('   OK — key berjaya diimport.');

  console.log('4. Bina & tandatangan JWT (RS256)...');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: DRIVE_FILE_SCOPE,
    aud: TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now,
  };

  const signingInput = base64UrlFromString(JSON.stringify(header)) + '.' + base64UrlFromString(JSON.stringify(claims));

  let signature;
  try {
    signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  } catch (caught) {
    console.error('   GAGAL menandatangan JWT:', caught.message);
    process.exit(1);
  }
  const assertion = signingInput + '.' + base64UrlFromBytes(new Uint8Array(signature));
  console.log('   OK — JWT ditandatangan (' + assertion.length + ' aksara).');

  console.log('5. Hantar ke ' + TOKEN_ENDPOINT + ' (had masa 15 saat)...');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: controller.signal,
    });
  } catch (caught) {
    if (caught.name === 'AbortError') {
      console.error('   GAGAL: Google tidak menjawab dalam 15 saat — semak sambungan rangkaian.');
    } else {
      console.error('   GAGAL:', caught.message);
    }
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    console.error('   GAGAL — Google pulangkan status', response.status);
    console.error('   Respons:', JSON.stringify(body, null, 2));
    console.error('');
    console.error('   Punca biasa: service account belum ditambah sebagai ahli Shared Drive,');
    console.error('   atau Drive API belum diaktifkan pada projek Google Cloud ini.');
    process.exit(1);
  }

  console.log('   OK — access_token diterima (' + body.access_token.length + ' aksara, luput dalam ' + body.expires_in + 's).');
  console.log('');
  console.log('BERJAYA — JWT signing & OAuth2 Service Account SAH. Selamat untuk deploy Edge Function.');
}

main();
