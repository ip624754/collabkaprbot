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
// - SQL checksum normalization (LF + trimEnd) to avoid false mismatches
//   from CRLF/LF conversions or trailing newline-only edits.
// - Each migration runs in its own transaction
// =====================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_TABLE = 'schema_migrations';

// IMPORTANT (fail-fast): only files matching `NNN..._name.sql` are allowed in migrations/
// This prevents accidental placement of scripts like `00_mark_all_applied.sql` into migrations/
// which could otherwise be executed on a fresh DB.
const MIGRATION_FILE_RE = /^\d{3,}_.+\.sql$/i;

function sha256Hex(s) {
  return crypto
    .createHash('sha256')
    .update(String(s || ''), 'utf8')
    .digest('hex');
}

function normalizeEolToLf(s) {
  // Canonicalize Windows/Mac line endings to LF.
  return String(s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeSqlForChecksum(sql) {
  // Canonical checksum basis:
  // 1) normalize EOLs to LF
  // 2) drop trailing whitespace/newlines at EOF only
  // NOTE: we do NOT strip whitespace inside the file.
  return normalizeEolToLf(sql).trimEnd();
}

function checksumCandidates(sqlRaw) {
  const raw = String(sqlRaw || '');
  const lf = normalizeEolToLf(raw);
  const lfTrim = lf.trimEnd();
  const crlf = lf.replace(/\n/g, '\r\n');
  const crlfTrim = lfTrim.replace(/\n/g, '\r\n');

  // Backward-compatible candidates:
  // - raw current file (whatever EOLs it has now)
  // - canonical LF / canonical CRLF
  // - normalized LF (trimEnd)
  // - normalized LF with 1..3 trailing \n (common "final newline" toggles)
  // - normalized CRLF with 1..3 trailing \r\n
  const c = {
    raw: sha256Hex(raw),
    lf: sha256Hex(lf),
    crlf: sha256Hex(crlf),
    norm: sha256Hex(lfTrim),
    norm_lf1: sha256Hex(lfTrim + '\n'),
    norm_lf2: sha256Hex(lfTrim + '\n\n'),
    norm_lf3: sha256Hex(lfTrim + '\n\n\n'),
    norm_crlf1: sha256Hex(crlfTrim + '\r\n'),
    norm_crlf2: sha256Hex(crlfTrim + '\r\n\r\n'),
    norm_crlf3: sha256Hex(crlfTrim + '\r\n\r\n\r\n')
  };

  return {
    candidates: c
  };
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

  const dirEntries = fs.readdirSync(__dirname);

  // Fail fast if any `.sql` file does NOT match the strict migration naming rule.
  // If someone accidentally copies `migration_pack/*.sql` into `migrations/`, we want to stop.
  const rogueSql = dirEntries
    .filter((f) => String(f).toLowerCase().endsWith('.sql'))
    .filter((f) => !MIGRATION_FILE_RE.test(f))
    .sort();

  if (rogueSql.length) {
    throw new Error(
      `[MIGRATIONS] Unsafe .sql files detected in migrations/ (refusing to run).\n` +
        `Allowed pattern: NNN..._name.sql (>=3 digits, e.g. 041_example.sql).\n` +
        `Move these files out of migrations/ (usually to migration_pack/):\n` +
        rogueSql.map((x) => `- ${x}`).join('\n')
    );
  }

  const files = dirEntries.filter((f) => MIGRATION_FILE_RE.test(f)).sort();

  let applied = 0;
  let skipped = 0;

  for (const f of files) {
    const fullPath = path.join(__dirname, f);
    const sqlRaw = fs.readFileSync(fullPath, 'utf8');

    const { candidates } = checksumCandidates(sqlRaw);
    const checksumToStore = candidates.norm;

    const prev = await getApplied(f);
    if (prev) {
      const expected = String(prev.checksum || '');
      const ok = Object.values(candidates).includes(expected);

      if (!ok) {
        throw new Error(
          `[MIGRATIONS] Checksum mismatch for ${f}.\n` +
            `This indicates an old migration file was edited.\n` +
            `Expected: ${expected}\n` +
            `Actual(raw):  ${candidates.raw}\n` +
            `Actual(LF):   ${candidates.lf}\n` +
            `Actual(CRLF): ${candidates.crlf}\n` +
            `Actual(norm): ${candidates.norm}`
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
      await client.query(sqlRaw);
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE}(name, checksum) VALUES ($1, $2)`,
        [f, checksumToStore]
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
