import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bumpPackageJsonVersion, computeNextVersion } from './release.mjs';

test('computeNextVersion incrementa patch/minor/major corretamente', () => {
  assert.equal(computeNextVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(computeNextVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(computeNextVersion('1.2.3', 'major'), '2.0.0');
});

test('computeNextVersion zera os campos menos significativos', () => {
  assert.equal(computeNextVersion('0.1.9', 'minor'), '0.2.0');
  assert.equal(computeNextVersion('0.9.9', 'major'), '1.0.0');
});

test('computeNextVersion rejeita versão atual fora do formato MAJOR.MINOR.PATCH', () => {
  assert.throws(
    () => computeNextVersion('1.2', 'patch'),
    /Versão atual inválida/,
  );
  assert.throws(
    () => computeNextVersion('1.2.3-beta', 'patch'),
    /Versão atual inválida/,
  );
});

test('computeNextVersion rejeita tipo de bump desconhecido', () => {
  assert.throws(
    () => computeNextVersion('1.2.3', 'sideways'),
    /Tipo de bump inválido/,
  );
});

test('bumpPackageJsonVersion só troca o campo version, preservando o resto', () => {
  const contents = JSON.stringify(
    {
      name: 'dev-dashboard',
      version: '0.1.0',
      private: true,
      scripts: { dev: 'node scripts/dev.mjs' },
    },
    null,
    2,
  );

  const updated = bumpPackageJsonVersion(contents, '0.2.0');
  const parsed = JSON.parse(updated);

  assert.equal(parsed.version, '0.2.0');
  assert.equal(parsed.name, 'dev-dashboard');
  assert.equal(parsed.private, true);
  assert.deepEqual(parsed.scripts, { dev: 'node scripts/dev.mjs' });
  assert.ok(updated.endsWith('\n'));
});
