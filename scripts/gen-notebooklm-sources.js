import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DIST_DIR = path.join(ROOT, 'dist');
const OUT_DIR = path.join(DIST_DIR, 'notebooklm_sources');
const OUT_ZIP = path.join(DIST_DIR, 'NOTEBOOKLM_AUDIT_SOURCES_NOTEBOOKLM50.zip');

const PACK_DIR = path.join(ROOT, 'docs', 'audit', 'notebooklm_pack');

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

async function copyDir(srcDir, dstDir) {
  await mkdirp(dstDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(srcDir, ent.name);
    const dst = path.join(dstDir, ent.name);
    if (ent.isDirectory()) await copyDir(src, dst);
    else if (ent.isFile()) await copyFile(src, dst);
  }
}

async function listFiles(dir) {
  const out = [];
  async function walk(d) {
    const ents = await fs.readdir(d, { withFileTypes: true });
    for (const ent of ents) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile()) out.push(p);
    }
  }
  await walk(dir);
  return out;
}

async function writeText(dst, text) {
  await mkdirp(path.dirname(dst));
  await fs.writeFile(dst, text, 'utf8');
}

function runZip(cwd, outZip) {
  // requires `zip` available (mac/linux). In CI / local dev it should exist.
  const r = spawnSync('zip', ['-r', outZip, '.'], { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error('zip failed. Make sure `zip` is installed.');
  }
}

async function main() {
  await mkdirp(DIST_DIR);
  await rmrf(OUT_DIR);
  await rmrf(OUT_ZIP);

  if (!(await exists(PACK_DIR))) {
    throw new Error('Missing docs/audit/notebooklm_pack. Generate it first (STEP186+).');
  }

  const files = await listFiles(PACK_DIR);
  const rels = files.map((p) => path.relative(PACK_DIR, p)).sort((a, b) => a.localeCompare(b, 'en'));

  // NotebookLM limit: 50 files max
  if (rels.length > 50) {
    throw new Error(`NotebookLM limit exceeded: ${rels.length} files (max 50). Reduce notebooklm_pack.`);
  }

  // NotebookLM часто не принимает .sql
  const bad = rels.filter((r) => r.toLowerCase().endsWith('.sql'));
  if (bad.length) {
    throw new Error(`NotebookLM blocks .sql. Found: ${bad.join(', ')}`);
  }

  // Copy pack
  await copyDir(PACK_DIR, path.join(OUT_DIR, 'notebooklm_pack'));

  // Index
  const idx = [
    '# NotebookLM audit sources (NOTEBOOKLM50)',
    '',
    'Этот архив собран под лимит NotebookLM: максимум 50 файлов.',
    'Все источники текстовые (.md/.txt). Миграции и ключевой код — в бандлах.',
    '',
    'Файлы:',
    ...rels.map((r) => `- notebooklm_pack/${r}`),
    '',
    'Открой сначала: notebooklm_pack/00_NOTEBOOKLM_PACK_RULES_RU.md',
  ].join('\n');

  await writeText(path.join(OUT_DIR, 'README_NOTEBOOKLM_PACK.txt'), idx);

  // zip
  await mkdirp(path.dirname(OUT_ZIP));
  runZip(OUT_DIR, OUT_ZIP);

  // Print summary
  console.log(`OK: ${rels.length} files. Output: ${OUT_ZIP}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
