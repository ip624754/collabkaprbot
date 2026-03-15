import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/db/pool.js';
import {
  ensureSchemaMigrationsTable,
  getLiveSchemaAdoptionStatus,
  listAppliedSchemaMigrations,
} from '../src/db/schemaMigrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_NAME_RE = /^(\d+)_.*\.sql$/;
const ADVISORY_LOCK_KEY = 20260315003n;

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function loadMigrationFiles() {
  const files = fs.readdirSync(__dirname)
    .filter((f) => MIGRATION_NAME_RE.test(f))
    .sort();

  const seenSeq = new Set();

  return files.map((filename) => {
    const match = filename.match(MIGRATION_NAME_RE);
    const seq = match?.[1] || '';
    if (seenSeq.has(seq)) {
      throw new Error(`Duplicate migration prefix detected: ${seq}`);
    }
    seenSeq.add(seq);

    const fullpath = path.join(__dirname, filename);
    const sql = fs.readFileSync(fullpath, 'utf8');
    if (!sql.trim()) {
      throw new Error(`Migration is empty: ${filename}`);
    }

    return {
      filename,
      fullpath,
      seq,
      sql,
      checksum: sha256(sql),
    };
  });
}

function buildPlan(files, appliedRows) {
  const appliedMap = new Map(appliedRows.map((row) => [row.filename, row]));
  const alreadyApplied = [];
  const pending = [];

  for (const file of files) {
    const applied = appliedMap.get(file.filename);
    if (!applied) {
      pending.push(file);
      continue;
    }

    if (applied.checksum !== file.checksum) {
      throw new Error(
        `Migration drift detected for ${file.filename}: checksum mismatch with schema_migrations record.`
      );
    }

    alreadyApplied.push(file.filename);
  }

  return { alreadyApplied, pending };
}

function printPlan(plan) {
  console.log(`Already applied: ${plan.alreadyApplied.length}`);
  console.log(`Pending: ${plan.pending.length}`);
  if (plan.pending.length) {
    for (const file of plan.pending) {
      console.log(`- ${file.filename}`);
    }
  }
}

function printAdoptionStatus(adoption) {
  console.log(`Live schema adoptable: ${adoption.eligible ? 'yes' : 'no'}`);
  console.log(`Markers checked: ${adoption.checked_markers}`);
  if (adoption.missing_markers.length) {
    console.log('Missing markers:');
    for (const marker of adoption.missing_markers) {
      console.log(`- ${marker}`);
    }
  } else {
    console.log(`Recovery command: ${adoption.command}`);
  }
}

async function runPending(client, plan) {
  for (const file of plan.pending) {
    console.log(`Running ${file.filename}`);
    await client.query('BEGIN');
    try {
      await client.query(file.sql);
      await client.query(
        `insert into schema_migrations (filename, checksum) values ($1, $2)`,
        [file.filename, file.checksum]
      );
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw new Error(`Failed migration ${file.filename}: ${error.message}`);
    }
  }
}

async function adoptLiveSchema(client, files, appliedRows, adoption) {
  if (appliedRows.length) {
    throw new Error('schema_migrations already contains rows. Use npm run migrate instead of migrate:adopt-live.');
  }

  if (!adoption.eligible) {
    const details = adoption.missing_markers.join(', ') || 'unknown';
    throw new Error(`Live schema adoption blocked. Missing markers: ${details}`);
  }

  await client.query('BEGIN');
  try {
    for (const file of files) {
      await client.query(
        `insert into schema_migrations (filename, checksum)
         values ($1, $2)
         on conflict (filename) do nothing`,
        [file.filename, file.checksum]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw new Error(`Failed to adopt live schema into schema_migrations: ${error.message}`);
  }

  console.log(`Adopted existing live schema into schema_migrations tracking (${files.length} file(s)).`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const statusOnly = args.has('--status') || args.has('--plan');
  const adoptLive = args.has('--adopt-live');
  const files = loadMigrationFiles();
  const client = await pool.connect();

  try {
    await client.query('select pg_advisory_lock($1::bigint)', [ADVISORY_LOCK_KEY.toString()]);
    await ensureSchemaMigrationsTable(client);

    const appliedRows = await listAppliedSchemaMigrations(client);
    const adoption = await getLiveSchemaAdoptionStatus(client);

    if (adoptLive) {
      printAdoptionStatus(adoption);
      await adoptLiveSchema(client, files, appliedRows, adoption);
      return;
    }

    const plan = buildPlan(files, appliedRows);
    printPlan(plan);

    if (!appliedRows.length) {
      printAdoptionStatus(adoption);
    }

    if (statusOnly) {
      return;
    }

    if (!plan.pending.length) {
      console.log('No pending migrations.');
      return;
    }

    await runPending(client, plan);
    console.log(`Migrations complete. Applied ${plan.pending.length} file(s).`);
  } finally {
    try {
      await client.query('select pg_advisory_unlock($1::bigint)', [ADVISORY_LOCK_KEY.toString()]);
    } catch {}
    try {
      client.release();
    } catch {}
    try {
      await pool.end();
    } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
