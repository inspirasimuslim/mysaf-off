#!/usr/bin/env node
// Gabungkan setiap Edge Function dengan `_shared/admin.ts` menjadi SATU fail.
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
const SHARED_FILE = join(FUNCTIONS_DIR, '_shared', 'admin.ts');
const OUT_DIR = join('scratchpad', 'deploy');

/** Satu pernyataan import (boleh berbilang baris), dari awal baris hingga `from '...'`. */
const IMPORT_STATEMENT = /^import\s[\s\S]*?\sfrom\s*['"][^'"]+['"];?[ \t]*$/gm;
const SHARED_IMPORT = /from\s*['"]\.\.\/_shared\/admin\.ts['"]/;

function splitImports(source) {
  const imports = source.match(IMPORT_STATEMENT) ?? [];
  const body = source.replace(IMPORT_STATEMENT, '').trim();
  return { imports: imports.map((line) => line.trim()), body };
}

const shared = splitImports(readFileSync(SHARED_FILE, 'utf8'));
// `export` dibuang: dalam satu fail, helper hanya perlu wujud, bukan dieksport.
const sharedBody = shared.body.replace(/^export\s+(?=(?:async\s+)?(?:const|let|function|class|type|interface)\b)/gm, '');

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
  const usesShared = own.imports.some((line) => SHARED_IMPORT.test(line));
  const ownImports = own.imports.filter((line) => !SHARED_IMPORT.test(line));
  const imports = [...new Set([...(usesShared ? shared.imports : []), ...ownImports])];

  const output = [
    '// DIJANA oleh scripts/build-deploy.mjs — jangan sunting terus.',
    '// Sumber: supabase/functions/' + name + '/index.ts' + (usesShared ? ' + supabase/functions/_shared/admin.ts' : ''),
    '// Tampal ke Dashboard Supabase > Edge Functions > ' + name + ' > Code, kemudian Deploy.',
    '',
    ...imports,
    '',
    ...(usesShared ? ['// --- _shared/admin.ts ' + '-'.repeat(56), '', sharedBody, ''] : []),
    '// --- ' + name + '/index.ts ' + '-'.repeat(Math.max(4, 64 - name.length)),
    '',
    own.body,
    '',
  ].join('\n');

  if (/['"]\.\.\/_shared\//.test(output)) {
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
