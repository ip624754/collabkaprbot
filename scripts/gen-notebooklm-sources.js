import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DIST_DIR = path.join(ROOT, 'dist');
const OUT_DIR = path.join(DIST_DIR, 'notebooklm_sources');
const OUT_ZIP = path.join(DIST_DIR, 'NOTEBOOKLM_AUDIT_SOURCES.zip');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function mkdirp(p) {
  await fs.mkdir(p, { recursive: true });
}

async function copyFile(src, dst) {
  await mkdirp(path.dirname(dst));
  await fs.copyFile(src, dst);
}

async function copyDir(srcDir, dstDir, { filter } = {}) {
  await mkdirp(dstDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(srcDir, ent.name);
    const dst = path.join(dstDir, ent.name);
    if (filter && !filter(src, ent)) continue;
    if (ent.isDirectory()) {
      await copyDir(src, dst, { filter });
    } else if (ent.isFile()) {
      await copyFile(src, dst);
    }
  }
}

async function writeText(dst, text) {
  await mkdirp(path.dirname(dst));
  await fs.writeFile(dst, text, 'utf8');
}

async function listFiles(dir, { suffix } = {}) {
  const out = [];
  async function walk(d) {
    const ents = await fs.readdir(d, { withFileTypes: true });
    for (const ent of ents) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile()) {
        if (!suffix || p.endsWith(suffix)) out.push(p);
      }
    }
  }
  await walk(dir);
  return out;
}

function shasum(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function convertSqlDirToTxt(srcDir, dstDir) {
  if (!(await exists(srcDir))) return;
  await mkdirp(dstDir);
  const files = (await fs.readdir(srcDir))
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  for (const name of files) {
    const src = path.join(srcDir, name);
    const body = await fs.readFile(src, 'utf8');
    const checksum = shasum(body);
    const header = [
      `-- SOURCE: ${path.basename(srcDir)}/${name}`,
      `-- SHA256: ${checksum}`,
      '',
    ].join('\n');
    const dst = path.join(dstDir, `${name}.txt`); // => 001_init.sql.txt
    await writeText(dst, header + body);
  }
}

async function main() {
  await mkdirp(DIST_DIR);
  await rmrf(OUT_DIR);
  await rmrf(OUT_ZIP);

  // 1) Docs (весь docs/ — это текст, NotebookLM ест нормально)
  await copyDir(path.join(ROOT, 'docs'), path.join(OUT_DIR, 'docs'));

  // 2) SQL (NotebookLM часто блокирует .sql, поэтому кладём .txt версии)
  await convertSqlDirToTxt(path.join(ROOT, 'migrations'), path.join(OUT_DIR, 'migrations_txt'));
  await convertSqlDirToTxt(path.join(ROOT, 'migration_pack'), path.join(OUT_DIR, 'migration_pack_txt'));

  // 3) Доп. контекст (Neon history, если есть в репо)
  const neonHist = path.join(ROOT, 'docs', 'neon', 'ИСТОРИЯ_НЕОН.txt');
  if (await exists(neonHist)) {
    await copyFile(neonHist, path.join(OUT_DIR, 'NEON_HISTORY', 'ИСТОРИЯ_НЕОН.txt'));
  }

  // 4) Индекс, чтобы аудитору было проще
  const idx = [
    '# NotebookLM audit sources (generated)',
    '',
    'Содержимое:',
    '- docs/ — вся документация проекта (включая docs/audit/*)',
    '- migrations_txt/ — копии миграций в формате .txt (каждый файл содержит SHA256)',
    '- migration_pack_txt/ — копии migration_pack скриптов в формате .txt (каждый файл содержит SHA256)',
    '- NEON_HISTORY/ — дополнительный контекст (если присутствует)',
    '',
    'Примечание: реальные миграции применяются только из migrations/*.sql через migrations/run.js.',
  ].join('\n');
  await writeText(path.join(OUT_DIR, 'INDEX.md'), idx);

  // 5) Zip (best-effort)
  const zipBin = process.platform === 'win32' ? 'powershell' : 'zip';
  if (zipBin === 'zip') {
    const rel = path.relative(DIST_DIR, OUT_DIR);
    const res = spawnSync('zip', ['-r', path.basename(OUT_ZIP), rel], {
      cwd: DIST_DIR,
      stdio: 'inherit',
    });
    if (res.status !== 0) {
      console.error('\n[WARN] zip command failed. Folder is ready:', OUT_DIR);
      process.exitCode = 1;
      return;
    }
    console.log('\nOK:', OUT_ZIP);
  } else {
    console.log('Windows: zip generation is skipped. Folder is ready:', OUT_DIR);
  }

  // 6) Small sanity: print file counts
  const docCount = (await listFiles(path.join(OUT_DIR, 'docs'))).length;
  const migCount = (await exists(path.join(OUT_DIR, 'migrations_txt')))
    ? (await listFiles(path.join(OUT_DIR, 'migrations_txt'))).length
    : 0;
  const packCount = (await exists(path.join(OUT_DIR, 'migration_pack_txt')))
    ? (await listFiles(path.join(OUT_DIR, 'migration_pack_txt'))).length
    : 0;
  console.log(`Docs files: ${docCount}`);
  console.log(`migrations_txt files: ${migCount}`);
  console.log(`migration_pack_txt files: ${packCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
