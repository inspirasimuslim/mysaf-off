#!/usr/bin/env node
// Sandaran DATA pangkalan data Supabase ke fail .sql bertarikh dalam backups/.
//
// Guna:
//   node scripts/backup-db.mjs              # simpan 12 fail terbaru
//   node scripts/backup-db.mjs --keep 26    # simpan 26 fail terbaru
//
// Password dibaca dari env var SUPABASE_DB_PASSWORD (jangan hardcode).
//
// APA YANG DISANDARKAN
//   - Setiap table dalam skema `public` (ahli, yuran, PIPIS, kehadiran, ...)
//   - `auth.users` dan `auth.identities` — `members.user_id` dan `profiles.id`
//     merujuk kepadanya, jadi tanpa kedua-duanya data public tidak boleh
//     dipulihkan dengan pautan akaun yang utuh.
//
// APA YANG TIDAK
//   - Skema (table, policy, fungsi) — itu sudah ada dalam supabase/migrations.
//   - FAIL dalam Storage (avatar, poster, QR). Hanya URL-nya ada dalam data.
//
// Fail yang terhasil mengandungi NRIC, alamat dan hash kata laluan. backups/
// ada dalam .gitignore — jangan kongsi atau muat naik fail ini.
//
// MEMULIHKAN: pada pangkalan data yang skemanya sudah dibina daripada migration,
//   node scripts/run-sql.mjs --file backups/<fail>.sql
// Setiap INSERT memakai `on conflict do nothing`, jadi larian separa boleh
// diulang tanpa menggandakan baris.

import { mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'mjxwvlvjmhqhnqprmbps';
const password = process.env.SUPABASE_DB_PASSWORD;
const BACKUP_DIR = 'backups';
const EXTRA_TABLES = [
  ['auth', 'users'],
  ['auth', 'identities'],
];

if (!password) {
  console.error('Ralat: env var SUPABASE_DB_PASSWORD tidak dijumpai.');
  process.exit(1);
}

const keepFlag = process.argv.indexOf('--keep');
const keep = keepFlag !== -1 ? Number.parseInt(process.argv[keepFlag + 1], 10) : 12;
if (!Number.isInteger(keep) || keep < 1) {
  console.error('Ralat: --keep mesti nombor bulat positif.');
  process.exit(1);
}

// Sama seperti run-sql.mjs: direct dahulu, pooler (IPv4) bila gagal.
async function connect() {
  const targets = [
    { host: `db.${PROJECT_REF}.supabase.co`, user: 'postgres' },
    {
      host: `aws-0-${process.env.SUPABASE_DB_REGION ?? 'ap-southeast-1'}.pooler.supabase.com`,
      user: `postgres.${PROJECT_REF}`,
    },
  ];

  let lastErr = null;
  for (const target of targets) {
    const client = new pg.Client({
      ...target,
      port: 5432,
      database: 'postgres',
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    try {
      await client.connect();
      console.log(`Sambung: ${target.host}`);
      return client;
    } catch (err) {
      lastErr = err;
      await client.end().catch(() => {});
    }
  }
  throw lastErr;
}

/**
 * Table disusun supaya table induk ditulis SEBELUM table yang merujuknya.
 * Tanpa susunan ini, pemulihan akan gagal pada foreign key pertama.
 */
async function orderedTables(client) {
  const { rows: tables } = await client.query(`
    select n.nspname as schema, c.relname as name, c.oid::int as oid
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and (n.nspname = 'public' or (n.nspname, c.relname) in (${EXTRA_TABLES.map(
        ([s, t]) => `('${s}', '${t}')`,
      ).join(', ')}))
  `);

  const { rows: fks } = await client.query(`
    select conrelid::int as child, confrelid::int as parent
    from pg_constraint where contype = 'f' and conrelid <> confrelid
  `);

  const byOid = new Map(tables.map((t) => [t.oid, t]));
  const parents = new Map(tables.map((t) => [t.oid, new Set()]));
  for (const { child, parent } of fks) {
    if (byOid.has(child) && byOid.has(parent)) parents.get(child).add(parent);
  }

  const ordered = [];
  const done = new Set();
  const visit = (oid, trail = new Set()) => {
    if (done.has(oid) || trail.has(oid)) return;
    trail.add(oid);
    for (const parent of parents.get(oid)) visit(parent, trail);
    done.add(oid);
    ordered.push(byOid.get(oid));
  };
  for (const t of [...tables].sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`))) {
    visit(t.oid);
  }
  return ordered;
}

/**
 * Baris ditukar kepada INSERT di PELAYAN dengan `quote_nullable`, supaya setiap
 * jenis (tarikh, JSON, array, numeric) dipetik oleh Postgres sendiri dan bukan
 * oleh kod pemetikan buatan tangan di sini.
 */
async function dumpTable(client, table) {
  const { rows: cols } = await client.query(
    `select quote_ident(attname) as col
     from pg_attribute
     where attrelid = $1 and attnum > 0 and not attisdropped and attgenerated = ''
     order by attnum`,
    [table.oid],
  );
  if (cols.length === 0) return { lines: [], count: 0 };

  const target = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
  const colList = cols.map((c) => c.col).join(', ');
  const values = cols.map((c) => `quote_nullable(${c.col})`).join(` || ', ' || `);

  const { rows } = await client.query(
    `select 'insert into ${target.replace(/'/g, "''")} (${colList.replace(/'/g, "''")}) values (' || ${values} || ') on conflict do nothing;' as line
     from ${target}`,
  );
  return { lines: rows.map((r) => r.line), count: rows.length };
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
}

/** Buang fail lama melebihi had `--keep`, yang terbaru dikekalkan. */
function prune() {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => /^mysaff-backup-.*\.sql$/.test(f))
    .map((f) => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(keep)) {
    unlinkSync(join(BACKUP_DIR, f));
    console.log(`Dibuang (lama): ${f}`);
  }
}

const startedAt = new Date();
mkdirSync(BACKUP_DIR, { recursive: true });
const finalPath = join(BACKUP_DIR, `mysaff-backup-${stamp(startedAt)}.sql`);
// Ditulis ke fail sementara dahulu: sandaran separuh jalan tidak boleh kelihatan
// seperti sandaran lengkap, dan tidak boleh menolak sandaran baik keluar melalui prune.
const tempPath = finalPath + '.partial';

let client;
try {
  client = await connect();
  // Satu snapshot untuk semua table — tanpa ini, bayaran yang direkod di tengah
  // sandaran boleh muncul tanpa ahlinya.
  await client.query('begin isolation level repeatable read read only');

  const tables = await orderedTables(client);
  const out = [
    `-- MySAFF sandaran data — ${startedAt.toISOString()}`,
    `-- Projek: ${PROJECT_REF}. Mengandungi data peribadi. JANGAN kongsi.`,
    '-- Pulihkan ke pangkalan data yang skemanya sudah dibina daripada supabase/migrations.',
    '',
    'begin;',
    // Matikan trigger (updated_at, guard) semasa pemulihan supaya nilai asal kekal.
    'set local session_replication_role = replica;',
    '',
  ];
  const summary = [];

  for (const table of tables) {
    const { lines, count } = await dumpTable(client, table);
    out.push(`-- ${table.schema}.${table.name}: ${count} baris`);
    out.push(...lines, '');
    summary.push(`${table.schema}.${table.name}=${count}`);
  }

  out.push('commit;', '', `-- Ringkasan: ${summary.join(', ')}`, '');
  await client.query('commit');

  writeFileSync(tempPath, out.join('\n'), 'utf8');
  renameSync(tempPath, finalPath);

  const sizeKb = Math.round(statSync(finalPath).size / 1024);
  console.log(`Siap: ${finalPath} (${sizeKb} KB, ${tables.length} table)`);
  console.log(summary.join('\n'));
  prune();
} catch (err) {
  try {
    unlinkSync(tempPath);
  } catch {
    // Tiada fail sementara untuk dibuang.
  }
  console.error('Sandaran GAGAL:', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
