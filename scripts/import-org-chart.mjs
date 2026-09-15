#!/usr/bin/env node
// Import carta organisasi awal dari seed-data/organisasi-2025-2027.xlsx.
//
// Guna:
//   node scripts/import-org-chart.mjs            # padan + import (hanya jika table kosong)
//   node scripts/import-org-chart.mjs --dry-run  # padan sahaja, tiada tulisan
//   node scripts/import-org-chart.mjs --replace  # padam carta sedia ada, import semula
//
// Nama dipadan dengan `normalizeNameForMatch()` DALAM generasi yang sama — logik
// yang sama digunakan modul yuran/PIPIS/usrah. Padanan tidak menentu dibiarkan
// kosong (member_id NULL) dan dilaporkan, bukan diteka.
//
// Password dibaca dari env var SUPABASE_DB_PASSWORD (jangan hardcode).

import { createRequire } from 'node:module';
import pg from 'pg';

import { findNearMatch, normalizeNameForMatch } from '../lib/name-matching.ts';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const FILE = 'seed-data/organisasi-2025-2027.xlsx';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'mjxwvlvjmhqhnqprmbps';
const password = process.env.SUPABASE_DB_PASSWORD;
const dryRun = process.argv.includes('--dry-run');
const replace = process.argv.includes('--replace');

if (!password) {
  console.error('Ralat: env var SUPABASE_DB_PASSWORD tidak dijumpai.');
  process.exit(1);
}

const sheet = XLSX.readFile(FILE).Sheets.Sheet1;
const rows = XLSX.utils
  .sheet_to_json(sheet, { defval: null })
  .map((row) => ({
    bahagian: String(row.Bahagian ?? '').trim(),
    jawatan: String(row.Jawatan ?? '').trim(),
    nama: String(row.Nama ?? '').trim(),
    generasi: String(row.Generasi ?? '').trim().toLowerCase(),
  }))
  .filter((row) => row.bahagian && row.jawatan);

const client = new pg.Client({
  host: `db.${PROJECT_REF}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await client.connect();

try {
  const { rows: members } = await client.query('select id, full_name, generasi from public.members');

  const matched = rows.map((row) => {
    if (!row.nama) return { ...row, member: null, how: 'kosong' };

    const key = normalizeNameForMatch(row.nama);
    const pool = members.filter((m) => (m.generasi ?? '').toLowerCase() === row.generasi);
    const exact = pool.filter((m) => normalizeNameForMatch(m.full_name) === key);

    if (exact.length === 1) return { ...row, member: exact[0], how: 'tepat' };
    if (exact.length > 1) return { ...row, member: null, how: 'tidak menentu' };

    const near = findNearMatch(key, pool, (m) => m.full_name);
    if (near) return { ...row, member: near.candidate, how: 'hampir ' + near.similarity.toFixed(2) };
    return { ...row, member: null, how: 'tiada padanan' };
  });

  console.table(
    matched.map((row, index) => ({
      '#': index + 1,
      bahagian: row.bahagian,
      jawatan: row.jawatan,
      fail: row.nama + ' (' + row.generasi + ')',
      db: row.member ? row.member.full_name + ' (' + row.member.generasi + ')' : '—',
      padanan: row.how,
    })),
  );

  const ok = matched.filter((row) => row.member).length;
  console.log(`Padan: ${ok}/${matched.length}`);

  if (dryRun) process.exit(0);

  await client.query('begin');
  const { rows: existing } = await client.query('select count(*)::int as n from public.org_positions');
  if (existing[0].n > 0) {
    if (!replace) {
      await client.query('rollback');
      console.error(`Table org_positions sudah ada ${existing[0].n} baris. Guna --replace untuk import semula.`);
      process.exit(1);
    }
    await client.query('delete from public.org_positions');
  }

  for (const [index, row] of matched.entries()) {
    await client.query(
      'insert into public.org_positions (bahagian, jawatan, member_id, display_order) values ($1, $2, $3, $4)',
      [row.bahagian, row.jawatan, row.member?.id ?? null, index + 1],
    );
  }
  await client.query('commit');
  console.log(`Import selesai: ${matched.length} baris.`);
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('Ralat:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
