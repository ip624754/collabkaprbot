import fs from 'node:fs';
import path from 'node:path';

const REPOSITORY_ORDER = Object.freeze([
  'usersRepository.js',
  'workspacesRepository.js',
  'giveawaysRepository.js',
  'bartersRepository.js',
  'monetizationRepository.js',
  'brandsRepository.js',
  'applicationsRepository.js',
  'broadcastsRepository.js',
  'socialRepository.js',
]);

export function readQueryImplementationSource(root = process.cwd()) {
  const base = path.resolve(root);
  const facadePath = path.join(base, 'src', 'db', 'queries.js');
  const repoDir = path.join(base, 'src', 'db', 'repositories');
  const parts = [fs.readFileSync(facadePath, 'utf8')];
  for (const file of REPOSITORY_ORDER) {
    parts.push(fs.readFileSync(path.join(repoDir, file), 'utf8'));
  }
  return parts.join('\n');
}

export { REPOSITORY_ORDER };
