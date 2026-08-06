import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { generateChangelog } from './generate-changelog.mjs';

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const VALID_BUMPS = ['patch', 'minor', 'major'];

export function computeNextVersion(currentVersion, bump) {
  const match = currentVersion.match(SEMVER_PATTERN);

  if (!match) {
    throw new Error(
      `Versão atual inválida: "${currentVersion}". Esperado MAJOR.MINOR.PATCH.`,
    );
  }

  if (!VALID_BUMPS.includes(bump)) {
    throw new Error(
      `Tipo de bump inválido: "${bump}". Use ${VALID_BUMPS.join(', ')}.`,
    );
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

export function bumpPackageJsonVersion(contents, nextVersion) {
  const pkg = JSON.parse(contents);
  pkg.version = nextVersion;
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export async function main() {
  const bump = process.argv[2];

  if (!bump) {
    console.error('Uso: node scripts/release.mjs <patch|minor|major>');
    process.exitCode = 1;
    return;
  }

  const packageJsonPath = new URL('../package.json', import.meta.url);
  const packageJsonContents = readFileSync(packageJsonPath, 'utf8');
  const currentVersion = JSON.parse(packageJsonContents).version;
  const nextVersion = computeNextVersion(currentVersion, bump);

  writeFileSync(
    packageJsonPath,
    bumpPackageJsonVersion(packageJsonContents, nextVersion),
    'utf8',
  );

  const changelogPath = new URL('../CHANGELOG.md', import.meta.url);
  writeFileSync(changelogPath, generateChangelog(), 'utf8');

  console.log(`Versão atualizada: ${currentVersion} -> ${nextVersion}`);
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
) {
  main();
}
