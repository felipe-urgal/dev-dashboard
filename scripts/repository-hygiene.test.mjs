import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

function trackedPaths() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

function looksLikeCommandErrorArtifact(path) {
  const segments = path.split('/');
  return (
    segments.some((segment) => /^(?:fatal|error):/u.test(segment)) ||
    path.includes(" does not exist in 'HEAD")
  );
}

test('não mantém mensagens de erro de comandos como arquivos versionados', () => {
  const suspiciousPaths = trackedPaths().filter(looksLikeCommandErrorArtifact);

  assert.deepEqual(
    suspiciousPaths,
    [],
    `Arquivos suspeitos encontrados no repositório: ${suspiciousPaths.join(', ')}`,
  );
});
