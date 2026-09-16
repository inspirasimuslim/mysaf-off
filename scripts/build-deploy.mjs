#!/usr/bin/env node
// Gabungkan setiap Edge Function dengan fail `_shared/*.ts` yang diimportnya menjadi SATU fail.
//
// Editor Edge Functions dalam Dashboard Supabase tidak nampak folder `_shared`,
// jadi `import ... from '../_shared/admin.ts'` gagal bila kod ditampal di sana.
// Skrip ini menyalin helper yang dikongsi terus ke dalam setiap fungsi. Guna
// bila `npx supabase functions deploy` tidak boleh dijalankan.
//
// Guna:
//   node scripts/build-deploy.mjs
//
// Hasil: scratchpad/deploy/<nama-fungsi>.ts (diabaikan git). Tampal ke
// Dashboard > Edge Functions > <nama-fungsi> > Code, kemudian Deploy.
//
// Sumber kebenaran kekal dalam supabase/functions — fail hasil dijana semula,
// jangan disunting terus.
//
// Fail hasil ditulis dengan BOM UTF-8. Windows PowerShell 5.1 membaca fail
// TANPA BOM sebagai Windows-1252, jadi `Get-Content ... | Set-Clipboard` dahulu
// merosakkan "·" (mojibake) dalam kod yang ditampal — dan label Log Aktiviti
// Admin tersimpan rosak. BOM itu dimakan oleh Get-Content, tidak ikut ditampal.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FUNCTIONS_DIR = join('supabase', 'functions');
const SHARED_DIR = join(FUNCTIONS_DIR, '_shared');
const OUT_DIR = join('scratchpad', 'deploy');

/** Satu pernyataan import (boleh berbilang baris), dari awal baris hingga `from '...'`. */
const IMPORT_STATEMENT = /^import\s[\s\S]*?\sfrom\s*['"][^'"]+['"];?[ \t]*$/gm;
/** `../_shared/x.ts` dari fungsi, atau `./x.ts` dari satu fail _shared ke yang lain. */
const SHARED_IMPORT = /from\s*['"](?:\.\.\/_shared\/|\.\/)([\w-]+\.ts)['"]/;

function splitImports(source) {
  const imports = source.match(IMPORT_STATEMENT) ?? [];
  const body = source.replace(IMPORT_STATEMENT, '').trim();
  return { imports: imports.map((line) => line.trim()), body };
}

const NAMED_IMPORT = /^import\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"]+)\2;?$/;

/**
 * Satukan import bernama daripada sumber yang sama.
 *
 * Deduplikasi teks sahaja tidak cukup: `_shared/admin.ts` mengimport
 * `{ createClient, type SupabaseClient }` dan fungsi itu sendiri
 * `{ createClient }` daripada modul yang sama — dua baris berbeza, dan dalam
 * satu fail ia menjadi "Identifier 'createClient' has already been declared".
 * Import lain (default, namespace) dikekalkan, hanya diduplikasi mengikut teks.
 */
function mergeImports(lines) {
  const named = new Map();
  const others = [];

  for (const line of lines) {
    const match = NAMED_IMPORT.exec(line);
    if (!match) {
      if (!others.includes(line)) others.push(line);
      continue;
    }
    const source = match[3];
    const specifiers = named.get(source) ?? new Map();
    for (const raw of match[1].split(',')) {
      const spec = raw.trim().replace(/\s+/g, ' ');
      if (!spec) continue;
      const bare = spec.replace(/^type\s+/, '');
      // Import nilai menang atas `type` untuk nama yang sama.
      if (!specifiers.has(bare) || specifiers.get(bare).startsWith('type ')) specifiers.set(bare, spec);
    }
    named.set(source, specifiers);
  }

  return [
    ...[...named].map(([source, specs]) => `import { ${[...specs.values()].join(', ')} } from '${source}';`),
    ...others,
  ];
}

const sharedCache = new Map();

/** Satu fail _shared: import luarnya, fail _shared yang diimportnya, dan badannya. */
function loadShared(file) {
  if (!sharedCache.has(file)) {
    const parts = splitImports(readFileSync(join(SHARED_DIR, file), 'utf8'));
    sharedCache.set(file, {
      deps: parts.imports.map((line) => SHARED_IMPORT.exec(line)?.[1]).filter(Boolean),
      imports: parts.imports.filter((line) => !SHARED_IMPORT.test(line)),
      // `export` dibuang: dalam satu fail, helper hanya perlu wujud, bukan dieksport.
      body: parts.body.replace(/^export\s+(?=(?:async\s+)?(?:const|let|function|class|type|interface)\b)/gm, ''),
    });
  }
  return sharedCache.get(file);
}

/** Fail _shared yang diperlukan, kebergantungan dahulu (admin.ts sebelum toyyibpay.ts). */
function sharedOrder(files, order = []) {
  for (const file of files) {
    if (order.includes(file)) continue;
    sharedOrder(loadShared(file).deps, order);
    if (!order.includes(file)) order.push(file);
  }
  return order;
}

mkdirSync(OUT_DIR, { recursive: true });

const names = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort();

let failed = false;

for (const name of names) {
  const indexPath = join(FUNCTIONS_DIR, name, 'index.ts');
  if (!existsSync(indexPath)) continue;

  const own = splitImports(readFileSync(indexPath, 'utf8'));
  const sharedFiles = sharedOrder(own.imports.map((line) => SHARED_IMPORT.exec(line)?.[1]).filter(Boolean));
  const ownImports = own.imports.filter((line) => !SHARED_IMPORT.test(line));
  const imports = mergeImports([...sharedFiles.flatMap((file) => loadShared(file).imports), ...ownImports]);

  const output = [
    '// DIJANA oleh scripts/build-deploy.mjs — jangan sunting terus.',
    '// Sumber: supabase/functions/' + name + '/index.ts' + sharedFiles.map((file) => ' + _shared/' + file).join(''),
    '// Tampal ke Dashboard Supabase > Edge Functions > ' + name + ' > Code, kemudian Deploy.',
    '',
    ...imports,
    '',
    ...sharedFiles.flatMap((file) => [
      '// --- _shared/' + file + ' ' + '-'.repeat(Math.max(4, 68 - file.length)),
      '',
      loadShared(file).body,
      '',
    ]),
    '// --- ' + name + '/index.ts ' + '-'.repeat(Math.max(4, 64 - name.length)),
    '',
    own.body,
    '',
  ].join('\n');

  if (/from\s*['"](?:\.\.\/_shared\/|\.\/)/.test(output)) {
    console.error('GAGAL ' + name + ': import _shared masih tertinggal.');
    failed = true;
    continue;
  }

  const outPath = join(OUT_DIR, name + '.ts');
  writeFileSync(outPath, '﻿' + output, 'utf8');

  const tempPassword = /TEMP_PASSWORD\s*=\s*'([^']+)'/.exec(output)?.[1];
  console.log(
    outPath +
      ' (' +
      Math.round(output.length / 1024) +
      ' KB' +
      (output.includes('TEMP_PASSWORD') && tempPassword ? ', TEMP_PASSWORD=' + tempPassword : '') +
      ')',
  );
}

if (failed) process.exitCode = 1;
