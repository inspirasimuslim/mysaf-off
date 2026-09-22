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

/** Deklarasi top-level (kolum 0) sahaja — bukan pembolehubah tempatan dalam fungsi. */
const TOP_LEVEL_DECL = /^(export\s+)?(async\s+)?(function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
/** Nama pengikat import bernama/lalai — untuk kesan langgar dengan deklarasi tempatan. */
const IMPORT_BINDING = /^import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([\s\S]*?)\})?\s*from/;

/**
 * Kira perubahan kedalaman kurungan `{([` bagi SATU baris, abaikan kandungan
 * string/template/komen — perlu supaya kurungan dalam literal rentetan
 * (cth "Tamat masa {label}") tidak mengelirukan pengesanan hujung deklarasi.
 * `state` disimpan merentasi panggilan untuk komen blok `/* ... *\/` berbilang baris.
 */
function braceDelta(line, state) {
  let delta = 0;
  let i = 0;
  while (i < line.length) {
    if (state.inBlockComment) {
      const end = line.indexOf('*/', i);
      if (end === -1) return delta;
      i = end + 2;
      state.inBlockComment = false;
      continue;
    }
    const ch = line[i];
    if (ch === '/' && line[i + 1] === '/') break;
    if (ch === '/' && line[i + 1] === '*') {
      state.inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') delta++;
    else if (ch === '}' || ch === ')' || ch === ']') delta--;
    i++;
  }
  return delta;
}

/** Senarai { name, start, end } bagi setiap deklarasi top-level dalam `lines`. */
function extractTopLevelDecls(lines) {
  const decls = [];
  const state = { inBlockComment: false };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = !state.inBlockComment && /^\S/.test(line) ? TOP_LEVEL_DECL.exec(line) : null;
    if (match) {
      const start = i;
      let depth = 0;
      let j = i;
      do {
        depth += braceDelta(lines[j], state);
        j++;
      } while (depth > 0 && j < lines.length);
      decls.push({ name: match[4], start, end: j - 1 });
      i = j;
    } else {
      braceDelta(line, state);
      i++;
    }
  }
  return decls;
}

/** Nama pengikat (import bernama/lalai) yang dihasilkan oleh satu baris import gabungan. */
function importBindingNames(importLines) {
  const names = [];
  for (const line of importLines) {
    const match = IMPORT_BINDING.exec(line);
    if (!match) continue;
    if (match[1]) names.push(match[1]);
    if (match[2]) {
      for (const raw of match[2].split(',')) {
        const spec = raw.trim().replace(/^type\s+/, '');
        if (!spec) continue;
        const alias = spec.split(/\s+as\s+/).pop().trim();
        if (alias) names.push(alias);
      }
    }
  }
  return names;
}

/**
 * Buang deklarasi top-level yang NAMANYA berulang merentasi berbilang fail
 * yang digabungkan (cth `LOG_TAG` diisytiharkan berasingan dalam
 * `_shared/google-drive.ts` DAN dalam `index.ts` fungsi yang mengimportnya —
 * "Identifier ... has already been declared" bila digabung jadi satu skop).
 * Deklarasi PERTAMA yang muncul (ikut susunan `sections`) dikekalkan; yang
 * berulang dibuang SEPENUHNYA (bukan sekadar baris pertama).
 */
function dedupeDeclarations(sections, seen) {
  return sections.map(({ label, lines }) => {
    const decls = extractTopLevelDecls(lines);
    const toRemove = [];
    for (const decl of decls) {
      if (seen.has(decl.name)) {
        toRemove.push(decl);
      } else {
        seen.add(decl.name);
      }
    }
    if (toRemove.length === 0) return { label, lines };
    const kept = lines.slice();
    for (const decl of toRemove) {
      for (let i = decl.start; i <= decl.end; i++) kept[i] = null;
    }
    return { label, lines: kept.filter((line) => line !== null) };
  });
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

  // Deklarasi top-level yang berulang nama (cth LOG_TAG dalam _shared DAN
  // dalam index.ts) dibuang — yang pertama muncul (susunan output di bawah:
  // import, _shared ikut kebergantungan, index.ts sendiri) dikekalkan.
  const seenNames = new Set(importBindingNames(imports));
  const sections = dedupeDeclarations(
    [
      ...sharedFiles.map((file) => ({ label: file, lines: loadShared(file).body.split('\n') })),
      { label: name + '/index.ts', lines: own.body.split('\n') },
    ],
    seenNames,
  );
  const dedupedBodies = new Map(sections.map((section) => [section.label, section.lines.join('\n')]));

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
      dedupedBodies.get(file),
      '',
    ]),
    '// --- ' + name + '/index.ts ' + '-'.repeat(Math.max(4, 64 - name.length)),
    '',
    dedupedBodies.get(name + '/index.ts'),
    '',
  ].join('\n');

  if (/from\s*['"](?:\.\.\/_shared\/|\.\/)/.test(output)) {
    console.error('GAGAL ' + name + ': import _shared masih tertinggal.');
    failed = true;
    continue;
  }

  const dupeNames = extractTopLevelDecls(output.split('\n')).reduce((counts, decl) => {
    counts.set(decl.name, (counts.get(decl.name) ?? 0) + 1);
    return counts;
  }, new Map());
  const stillDuplicated = [...dupeNames].filter(([, count]) => count > 1).map(([n]) => n);
  if (stillDuplicated.length > 0) {
    console.error('GAGAL ' + name + ': deklarasi berulang tidak dibetulkan: ' + stillDuplicated.join(', '));
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
