import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pool } from '../src/db/pool.js';

// =====================================================
// Migration runner (Jobs/Vitalik/Woz):
// - Deterministic ordering
// - Exactly-once application (schema_migrations table)
// - Checksums to prevent "silent edits" of old migrations
// - Each migration runs in its own transaction
// =====================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_TABLE = 'schema_migrations';

function sha256Hex(s) {
  return crypto
    .createHash('sha256')
    .update(String(s || ''), 'utf8')
    .digest('hex');
}

async function ensureMigrationsTable() {
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `
  );
}

async function getApplied(name) {
  const r = await pool.query(
    `SELECT name, checksum, applied_at FROM ${MIGRATIONS_TABLE} WHERE name = $1`,
    [name]
  );
  return r.rows?.[0] || null;
}

async function run() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');

  await ensureMigrationsTable();

  const files = fs
    .readdirSync(__dirname)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  let applied = 0;
  let skipped = 0;

  for (const f of files) {
    const fullPath = path.join(__dirname, f);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const checksum = sha256Hex(sql);

    const prev = await getApplied(f);
    if (prev) {
      if (String(prev.checksum || '') !== checksum) {
        throw new Error(
          `[MIGRATIONS] Checksum mismatch for ${f}.\n` +
            `This indicates an old migration file was edited.\n` +
            `Expected: ${prev.checksum}\nActual:   ${checksum}`
        );
      }
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[MIGRATIONS] (dry-run) would apply: ${f}`);
      continue;
    }

    console.log(`[MIGRATIONS] Applying: ${f}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE}(name, checksum) VALUES ($1, $2)`,
        [f, checksum]
      );
      await client.query('COMMIT');
      applied += 1;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  }

  if (!dryRun) {
    console.log(`[MIGRATIONS] Complete. applied=${applied} skipped=${skipped}`);
  }

  await pool.end();
}

run().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
