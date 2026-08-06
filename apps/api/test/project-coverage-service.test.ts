import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ProjectCoverageService } from '../src/services/project-coverage-service.js';

async function makeProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'dashboard-coverage-'));
}

function istanbulFile(overrides: {
  statementHits: number[];
  functionHits?: number[];
  branchHits?: number[][];
  statementLines?: number[];
}) {
  const statementLines =
    overrides.statementLines ??
    overrides.statementHits.map((_, index) => index + 1);
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  overrides.statementHits.forEach((hit, index) => {
    statementMap[String(index)] = {
      start: { line: statementLines[index], column: 0 },
      end: { line: statementLines[index], column: 10 },
    };
    s[String(index)] = hit;
  });

  const fnMap: Record<string, unknown> = {};
  const f: Record<string, number> = {};
  (overrides.functionHits ?? []).forEach((hit, index) => {
    fnMap[String(index)] = { name: `fn${index}` };
    f[String(index)] = hit;
  });

  const branchMap: Record<string, unknown> = {};
  const b: Record<string, number[]> = {};
  (overrides.branchHits ?? []).forEach((hits, index) => {
    branchMap[String(index)] = { type: 'if' };
    b[String(index)] = hits;
  });

  return { statementMap, s, fnMap, f, branchMap, b };
}

test('retorna available:false quando não há coverage-final.json', async () => {
  const projectPath = await makeProject();
  try {
    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath);
    assert.deepEqual(summary, { available: false });
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('resume statements/functions/branches/lines de um coverage-final.json válido', async () => {
  const projectPath = await makeProject();
  try {
    await mkdir(path.join(projectPath, 'coverage'), { recursive: true });
    const filePath = path.join(projectPath, 'src', 'sum.ts');
    const report = {
      [filePath]: istanbulFile({
        statementHits: [1, 0, 1],
        functionHits: [1, 0],
        branchHits: [
          [1, 0],
          [1, 1],
        ],
      }),
    };
    await writeFile(
      path.join(projectPath, 'coverage', 'coverage-final.json'),
      JSON.stringify(report),
    );

    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath);

    assert.equal(summary.available, true);
    assert.ok(summary.generatedAt);
    assert.deepEqual(summary.total, {
      statements: { total: 3, covered: 2, pct: 66.67 },
      branches: { total: 4, covered: 3, pct: 75 },
      functions: { total: 2, covered: 1, pct: 50 },
      lines: { total: 3, covered: 2, pct: 66.67 },
    });
    assert.equal(summary.files?.length, 1);
    assert.equal(summary.files?.[0]!.path, 'src/sum.ts');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('trata linhas com múltiplos statements pelo maior hit count', async () => {
  const projectPath = await makeProject();
  try {
    await mkdir(path.join(projectPath, 'coverage'), { recursive: true });
    const filePath = path.join(projectPath, 'src', 'ternary.ts');
    const report = {
      [filePath]: istanbulFile({
        statementHits: [0, 1],
        statementLines: [1, 1],
      }),
    };
    await writeFile(
      path.join(projectPath, 'coverage', 'coverage-final.json'),
      JSON.stringify(report),
    );

    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath);

    assert.deepEqual(summary.total?.lines, { total: 1, covered: 1, pct: 100 });
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('ignora entradas fora do projeto e arquivos malformados sem quebrar', async () => {
  const projectPath = await makeProject();
  try {
    await mkdir(path.join(projectPath, 'coverage'), { recursive: true });
    const insidePath = path.join(projectPath, 'src', 'ok.ts');
    const outsidePath = path.join(os.tmpdir(), 'outside.ts');
    const report = {
      [insidePath]: istanbulFile({ statementHits: [1] }),
      [outsidePath]: istanbulFile({ statementHits: [1] }),
      malformed: 'not an object entry value, but a string',
    };
    await writeFile(
      path.join(projectPath, 'coverage', 'coverage-final.json'),
      JSON.stringify(report),
    );

    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath);

    assert.equal(summary.available, true);
    assert.equal(summary.files?.length, 1);
    assert.equal(summary.files?.[0]!.path, 'src/ok.ts');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('retorna available:false para JSON corrompido', async () => {
  const projectPath = await makeProject();
  try {
    await mkdir(path.join(projectPath, 'coverage'), { recursive: true });
    await writeFile(
      path.join(projectPath, 'coverage', 'coverage-final.json'),
      '{ isso não é json válido',
    );

    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath);

    assert.deepEqual(summary, { available: false });
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('SimpleCov: available:false quando não há .resultset.json', async () => {
  const projectPath = await makeProject();
  try {
    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath, 'rails');
    assert.deepEqual(summary, { available: false });
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('SimpleCov: resume lines/branches e reusa lines como statements, functions sempre 0/0', async () => {
  const projectPath = await makeProject();
  try {
    await mkdir(path.join(projectPath, 'coverage'), { recursive: true });
    const filePath = path.join(projectPath, 'app', 'models', 'user.rb');
    const resultset = {
      RSpec: {
        coverage: {
          [filePath]: {
            lines: [1, 0, null, 2],
            branches: {
              'if#1': { then: 1, else: 0 },
            },
          },
        },
      },
    };
    await writeFile(
      path.join(projectPath, 'coverage', '.resultset.json'),
      JSON.stringify(resultset),
    );

    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath, 'rails');

    assert.equal(summary.available, true);
    assert.ok(summary.generatedAt);
    assert.deepEqual(summary.total, {
      statements: { total: 3, covered: 2, pct: 66.67 },
      branches: { total: 2, covered: 1, pct: 50 },
      functions: { total: 0, covered: 0, pct: 100 },
      lines: { total: 3, covered: 2, pct: 66.67 },
    });
    assert.equal(summary.files?.length, 1);
    assert.equal(summary.files?.[0]!.path, 'app/models/user.rb');
    assert.deepEqual(summary.files?.[0]!.statements, summary.files?.[0]!.lines);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('SimpleCov: array de linhas direto (formato antigo) também é suportado', async () => {
  const projectPath = await makeProject();
  try {
    await mkdir(path.join(projectPath, 'coverage'), { recursive: true });
    const filePath = path.join(projectPath, 'app', 'models', 'legacy.rb');
    const resultset = {
      RSpec: {
        coverage: {
          [filePath]: [1, 1, null, 0],
        },
      },
    };
    await writeFile(
      path.join(projectPath, 'coverage', '.resultset.json'),
      JSON.stringify(resultset),
    );

    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath, 'rails');

    assert.deepEqual(summary.total?.lines, {
      total: 3,
      covered: 2,
      pct: 66.67,
    });
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('SimpleCov: une múltiplas suítes pelo maior hit count por linha', async () => {
  const projectPath = await makeProject();
  try {
    await mkdir(path.join(projectPath, 'coverage'), { recursive: true });
    const filePath = path.join(projectPath, 'app', 'models', 'user.rb');
    const resultset = {
      RSpec: {
        coverage: {
          [filePath]: { lines: [0, 1, null] },
        },
      },
      Cucumber: {
        coverage: {
          [filePath]: { lines: [1, 0, null] },
        },
      },
    };
    await writeFile(
      path.join(projectPath, 'coverage', '.resultset.json'),
      JSON.stringify(resultset),
    );

    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath, 'rails');

    assert.deepEqual(summary.total?.lines, { total: 2, covered: 2, pct: 100 });
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('SimpleCov: ignora entradas fora do projeto e suítes malformadas', async () => {
  const projectPath = await makeProject();
  try {
    await mkdir(path.join(projectPath, 'coverage'), { recursive: true });
    const insidePath = path.join(projectPath, 'app', 'models', 'ok.rb');
    const outsidePath = path.join(os.tmpdir(), 'outside.rb');
    const resultset = {
      RSpec: {
        coverage: {
          [insidePath]: { lines: [1] },
          [outsidePath]: { lines: [1] },
        },
      },
      Malformed: 'not an object',
    };
    await writeFile(
      path.join(projectPath, 'coverage', '.resultset.json'),
      JSON.stringify(resultset),
    );

    const service = new ProjectCoverageService();
    const summary = await service.getSummary(projectPath, 'rails');

    assert.equal(summary.available, true);
    assert.equal(summary.files?.length, 1);
    assert.equal(summary.files?.[0]!.path, 'app/models/ok.rb');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});
