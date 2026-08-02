import fs from 'node:fs';
import path from 'node:path';

function normalizeRel(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function countLines(text) {
  if (!text) return 0;
  const normalized = String(text).replace(/\r\n/g, '\n');
  return normalized.split('\n').length - (normalized.endsWith('\n') ? 1 : 0);
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (!av || !bv) return null;
  for (let i = 0; i < 3; i += 1) {
    if (av[i] > bv[i]) return 1;
    if (av[i] < bv[i]) return -1;
  }
  return 0;
}

function extractModuleSpecifiers(source) {
  const out = [];
  const text = String(source || '');
  const patterns = [
    /\bimport\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'";]+?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) out.push(match[1]);
  }
  return out;
}

function declarationPattern(name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(?:function|class|const|let|var)\\s+${escaped}\\b`);
}

function makeReader(root, overrides = new Map()) {
  const normalizedOverrides = new Map(
    Array.from(overrides.entries()).map(([key, value]) => [normalizeRel(key), String(value)])
  );

  return {
    exists(rel) {
      const key = normalizeRel(rel);
      if (normalizedOverrides.has(key)) return true;
      return fs.existsSync(path.join(root, key));
    },
    readText(rel) {
      const key = normalizeRel(rel);
      if (normalizedOverrides.has(key)) return normalizedOverrides.get(key);
      return fs.readFileSync(path.join(root, key), 'utf8');
    },
    readJson(rel) {
      return JSON.parse(this.readText(rel));
    },
    listFiles(relDir) {
      const key = normalizeRel(relDir);
      const abs = path.join(root, key);
      if (!fs.existsSync(abs)) return [];
      return fs.readdirSync(abs, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
    },
  };
}

function addFailure(failures, gate, pathValue, message, details = {}) {
  failures.push({ gate, path: normalizeRel(pathValue), message, ...details });
}

function testPatterns({ source, patterns, failures, gate, pathValue }) {
  for (const patternSource of patterns || []) {
    const pattern = new RegExp(patternSource, 'i');
    if (pattern.test(source)) {
      addFailure(failures, gate, pathValue, `forbidden pattern matched: ${patternSource}`);
    }
  }
}

function validatePackage({ reader, manifest, failures, checks }) {
  const pkg = reader.readJson('package.json');
  const lock = reader.readJson('package-lock.json');
  const minimum = manifest.package?.minimumVersion;
  const cmp = compareVersions(pkg.version, minimum);
  checks.push({ gate: 'package_minimum', status: cmp != null && cmp >= 0 ? 'PASS' : 'FAIL' });
  if (cmp == null || cmp < 0) {
    addFailure(failures, 'package_minimum', 'package.json', `version ${pkg.version} is below ${minimum}`);
  }

  if (manifest.package?.requireLockParity) {
    const lockRootVersion = lock?.packages?.['']?.version;
    const parity = pkg.version === lock.version && pkg.version === lockRootVersion;
    checks.push({ gate: 'package_lock_parity', status: parity ? 'PASS' : 'FAIL' });
    if (!parity) {
      addFailure(
        failures,
        'package_lock_parity',
        'package-lock.json',
        `package=${pkg.version}, lock=${lock.version}, lockRoot=${lockRootVersion}`
      );
    }
  }
}

function validateFacades({ reader, manifest, failures, checks }) {
  for (const facade of manifest.facades || []) {
    const gate = `facade:${facade.id}`;
    if (!reader.exists(facade.path)) {
      addFailure(failures, gate, facade.path, 'file missing');
      checks.push({ gate, status: 'FAIL' });
      continue;
    }
    const source = reader.readText(facade.path);
    const lines = countLines(source);
    if (lines > facade.maxLines) {
      addFailure(failures, gate, facade.path, `line limit exceeded: ${lines} > ${facade.maxLines}`, { lines });
    }
    for (const token of facade.requiredTokens || []) {
      if (!source.includes(token)) addFailure(failures, gate, facade.path, `required token missing: ${token}`);
    }
    testPatterns({ source, patterns: facade.forbiddenPatterns, failures, gate, pathValue: facade.path });

    const relativeSpecifiers = extractModuleSpecifiers(source).filter((value) => value.startsWith('.'));
    if (facade.allowedRelativeSpecifiers) {
      const allowed = new Set(facade.allowedRelativeSpecifiers);
      for (const specifier of relativeSpecifiers) {
        if (!allowed.has(specifier)) {
          addFailure(failures, gate, facade.path, `unowned relative specifier: ${specifier}`);
        }
      }
    }
    if (facade.allowedRelativeSpecifierPrefixes) {
      for (const specifier of relativeSpecifiers) {
        if (!facade.allowedRelativeSpecifierPrefixes.some((prefix) => specifier.startsWith(prefix))) {
          addFailure(failures, gate, facade.path, `specifier outside owned prefixes: ${specifier}`);
        }
      }
    }
    checks.push({ gate, status: failures.some((item) => item.gate === gate) ? 'FAIL' : 'PASS', lines });
  }
}

function validateRouteOwnership({ reader, manifest, failures, checks }) {
  for (const route of manifest.routeOwnership || []) {
    const gate = `route:${route.route}`;
    if (!reader.exists(route.route)) {
      addFailure(failures, gate, route.route, 'route missing');
      checks.push({ gate, status: 'FAIL' });
      continue;
    }
    const source = reader.readText(route.route);
    const lines = countLines(source);
    if (lines > route.maxLines) {
      addFailure(failures, gate, route.route, `line limit exceeded: ${lines} > ${route.maxLines}`, { lines });
    }
    const specifiers = extractModuleSpecifiers(source).filter((value) => value.startsWith('.'));
    const unique = Array.from(new Set(specifiers));
    if (unique.length !== 1 || unique[0] !== route.owner) {
      addFailure(
        failures,
        gate,
        route.route,
        `route must delegate only to ${route.owner}; found ${unique.join(', ') || '<none>'}`
      );
    }
    if (!/\bexport\s+[^;]*\bdefault\b[^;]*\bfrom\b/.test(source)) {
      addFailure(failures, gate, route.route, 'default handler re-export missing');
    }
    if (route.requireRawBodyConfig && !/bodyParser\s*:\s*false/.test(source)) {
      addFailure(failures, gate, route.route, 'raw body config missing');
    }
    checks.push({ gate, status: failures.some((item) => item.gate === gate) ? 'FAIL' : 'PASS', lines });
  }
}

function validateOwnedDirectories({ reader, manifest, failures, checks }) {
  for (const owned of manifest.ownedDirectories || []) {
    const gate = `owned:${owned.id}`;
    const actual = new Set(reader.listFiles(owned.path));
    for (const required of owned.requiredFiles || []) {
      if (!actual.has(required)) addFailure(failures, gate, `${owned.path}/${required}`, 'required owner file missing');
    }
    checks.push({ gate, status: failures.some((item) => item.gate === gate) ? 'FAIL' : 'PASS' });
  }
}

function validateFrontend({ reader, manifest, failures, checks }) {
  const cfg = manifest.frontend;
  if (!cfg) return;
  const gate = 'frontend';
  const entry = reader.readText(cfg.entry);
  const entryLines = countLines(entry);
  if (entryLines > cfg.maxEntryLines) {
    addFailure(failures, gate, cfg.entry, `entry line limit exceeded: ${entryLines} > ${cfg.maxEntryLines}`, { lines: entryLines });
  }

  const html = reader.readText(cfg.html);
  const moduleScripts = Array.from(html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi));
  if (moduleScripts.length !== 1) {
    addFailure(failures, gate, cfg.html, `expected exactly one module script, found ${moduleScripts.length}`);
  } else if (!moduleScripts[0][1].startsWith(cfg.publicAsset)) {
    addFailure(failures, gate, cfg.html, `public entry changed: ${moduleScripts[0][1]}`);
  }

  const hManifest = reader.readJson(cfg.moduleManifest);
  const manifestFactories = new Set();
  for (const module of hManifest.modules || []) {
    manifestFactories.add(module.factory);
    if (!reader.exists(module.path)) {
      addFailure(failures, gate, module.path, 'frontend module missing');
      continue;
    }
    const moduleSource = reader.readText(module.path);
    if (!new RegExp(`\\bexport\\s+function\\s+${module.factory}\\b`).test(moduleSource)) {
      addFailure(failures, gate, module.path, `factory export missing: ${module.factory}`);
    }
    if (!entry.includes(`from './admin-web/${module.id}.js'`)) {
      addFailure(failures, gate, cfg.entry, `module import missing: ${module.id}`);
    }
    for (const patternSource of cfg.forbiddenModulePatterns || []) {
      const pattern = new RegExp(patternSource, 'i');
      if (pattern.test(moduleSource)) {
        addFailure(failures, gate, module.path, `view module crossed orchestration boundary: ${patternSource}`);
      }
    }
    for (const declaration of module.declarations || []) {
      if (declarationPattern(declaration).test(entry)) {
        addFailure(failures, gate, cfg.entry, `moved declaration returned to entry: ${declaration}`);
      }
    }
  }

  for (const factory of cfg.requiredFactories || []) {
    if (!manifestFactories.has(factory)) {
      addFailure(failures, gate, cfg.moduleManifest, `required factory absent from module manifest: ${factory}`);
    }
    if (!entry.includes(factory)) {
      addFailure(failures, gate, cfg.entry, `required factory absent from entry: ${factory}`);
    }
  }

  checks.push({ gate, status: failures.some((item) => item.gate === gate) ? 'FAIL' : 'PASS', lines: entryLines });
}

export function evaluateStep590Architecture({ root, manifestPath = 'docs/architecture/STEP590I_ARCHITECTURE_GATES_MANIFEST.json', overrides = new Map() }) {
  const reader = makeReader(root, overrides);
  const manifest = reader.readJson(manifestPath);
  const failures = [];
  const checks = [];

  validatePackage({ reader, manifest, failures, checks });
  validateFacades({ reader, manifest, failures, checks });
  validateRouteOwnership({ reader, manifest, failures, checks });
  validateOwnedDirectories({ reader, manifest, failures, checks });
  validateFrontend({ reader, manifest, failures, checks });

  return {
    ok: failures.length === 0,
    manifestVersion: manifest.version,
    checks,
    failures,
    summary: {
      checks: checks.length,
      passed: checks.filter((item) => item.status === 'PASS').length,
      failed: checks.filter((item) => item.status === 'FAIL').length,
    },
  };
}

export { countLines, compareVersions, extractModuleSpecifiers };
