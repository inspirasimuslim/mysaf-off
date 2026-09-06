#!/usr/bin/env node
// Jalankan SQL ad-hoc terus ke Supabase Postgres.
//
// Guna:
//   node scripts/run-sql.mjs "select count(*) from members;"
//   node scripts/run-sql.mjs --file supabase/migrations/xxxx.sql
//   echo "select 1;" | node scripts/run-sql.mjs
//
// Password dibaca dari env var SUPABASE_DB_PASSWORD (jangan hardcode).

import { readFileSync } from 'node:fs';
import pg from 'pg';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'mjxwvlvjmhqhnqprmbps';
const password = process.env.SUPABASE_DB_PASSWORD;

if (!password) {
  console.error('Ralat: env var SUPABASE_DB_PASSWORD tidak dijumpai.');
  process.exit(1);
}

function readSql(argv) {
  const fileFlag = argv.findIndex((a) => a === '--file' || a === '-f');
  if (fileFlag !== -1) {
    const path = argv[fileFlag + 1];
    if (!path) throw new Error('--file perlukan laluan fail.');
    return readFileSync(path, 'utf8');
  }
  const inline = argv.filter((a) => !a.startsWith('-')).join(' ').trim();
  if (inline) return inline;
  try {
    return readFileSync(0, 'utf8').trim();
  } catch {
    return '';
  }
}

function printResult(res, index, total) {
  const label = total > 1 ? `[${index + 1}/${total}] ` : '';
  if (res.rows && res.rows.length > 0) {
    console.log(`${label}${res.command} — ${res.rows.length} baris`);
    console.table(res.rows);
  } else if (res.rowCount !== null && res.rowCount !== undefined) {
    console.log(`${label}${res.command ?? 'OK'} — ${res.rowCount} baris terlibat`);
  } else {
    console.log(`${label}${res.command ?? 'OK'}`);
  }
}

const sql = readSql(process.argv.slice(2));
if (!sql) {
  console.error('Ralat: tiada SQL diberi.\nGuna: node scripts/run-sql.mjs "SELECT ..."  atau  --file <path.sql>');
  process.exit(1);
}

// Direct connection dulu; kalau gagal (IPv6/DNS), cuba Supabase pooler (IPv4).
const targets = [
  {
    name: 'direct',
    config: {
      host: `db.${PROJECT_REF}.supabase.co`,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    },
  },
  {
    name: 'pooler',
    config: {
      host: `aws-0-${process.env.SUPABASE_DB_REGION ?? 'ap-southeast-1'}.pooler.supabase.com`,
      port: 5432,
      database: 'postgres',
      user: `postgres.${PROJECT_REF}`,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    },
  },
];

let client = null;
let lastErr = null;

for (const target of targets) {
  const candidate = new pg.Client(target.config);
  try {
    await candidate.connect();
    client = candidate;
    console.log(`Sambung: ${target.name} (${target.config.host})`);
    break;
  } catch (err) {
    lastErr = err;
    await candidate.end().catch(() => {});
  }
}

if (!client) {
  console.error('Ralat sambungan:', lastErr?.message ?? lastErr);
  process.exit(1);
}

try {
  const out = await client.query(sql);
  const results = Array.isArray(out) ? out : [out];
  results.forEach((res, i) => printResult(res, i, results.length));
} catch (err) {
  console.error('Ralat SQL:', err.message);
  if (err.hint) console.error('Hint:', err.hint);
  process.exitCode = 1;
} finally {
  await client.end();
}
