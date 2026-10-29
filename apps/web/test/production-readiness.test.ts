import { describe, expect, it } from 'vitest';

import type {
  ProjectGitOverview,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';

import { buildProductionReadiness } from '../src/utils/production-readiness';

const HEAD = 'a'.repeat(40);

function git(overrides: Partial<ProjectGitOverview> = {}): ProjectGitOverview {
  return {
    repository: true,
    branch: 'main',
    detached: false,
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    latestCommit: {
      hash: HEAD,
      shortHash: HEAD.slice(0, 8),
      subject: 'feat: x',
      authorName: 'Dev',
      authorEmail: 'dev@example.test',
      authoredAt: '2026-10-29T10:00:00.000Z',
    },
    recentCommits: [],
    ...overrides,
  };
}

function run(
  overrides: Partial<TestExecutionRecord> = {},
): TestExecutionRecord {
  return {
    id: 'r1',
    projectId: 'p',
    commandId: 'full-suite',
    scope: 'full-suite',
    gitRevision: HEAD,
    status: 'stopped',
    startedAt: '2026-10-29T10:00:00.000Z',
    finishedAt: '2026-10-29T10:01:00.000Z',
    exitCode: 0,
    ...overrides,
  };
}

const base = {
  branch: 'main',
  changes: null,
  health: null,
  hasBackupCommand: false,
} as const;

function item(items: ReturnType<typeof buildProductionReadiness>, id: string) {
  return items.find((entry) => entry.id === id);
}

describe('buildProductionReadiness', () => {
  it('só avisa sobre testes: sem execução nesta revisão e com falha viram avisos', () => {
    const none = buildProductionReadiness({
      ...base,
      git: git(),
      tests: [run({ gitRevision: 'b'.repeat(40) })],
    });
    expect(item(none, 'tests')?.tone).toBe('warn');
    expect(item(none, 'tests')?.action?.id).toBe('run-tests');

    const failed = buildProductionReadiness({
      ...base,
      git: git(),
      tests: [run({ exitCode: 1, status: 'failed' })],
    });
    expect(item(failed, 'tests')?.label).toMatch(/falharam/);
    expect(item(failed, 'tests')?.tone).toBe('warn');
  });

  it('aprova a suíte completa que passou na revisão atual e avisa quando foi parcial', () => {
    const ok = buildProductionReadiness({
      ...base,
      git: git(),
      tests: [run()],
    });
    expect(item(ok, 'tests')?.tone).toBe('ok');

    const partial = buildProductionReadiness({
      ...base,
      git: git(),
      tests: [
        run({ scope: 'targeted', targetFiles: ['a.test.ts', 'b.test.ts'] }),
      ],
    });
    expect(item(partial, 'tests')?.tone).toBe('warn');
    expect(item(partial, 'tests')?.detail).toContain('2 arquivos');
  });

  it('avisa árvore suja, branch diferente e divergência com o origin', () => {
    const items = buildProductionReadiness({
      ...base,
      git: git({ clean: false, branch: 'feature/x', ahead: 2, behind: 1 }),
      tests: null,
    });
    expect(item(items, 'tests')).toBeUndefined();
    expect(item(items, 'clean')?.tone).toBe('warn');
    expect(item(items, 'branch')?.label).toContain('feature/x');
    expect(item(items, 'sync')?.detail).toContain('2 commits locais');
  });

  it('avisa migrations, backup exigido sem comando e produção degradada', () => {
    const items = buildProductionReadiness({
      ...base,
      git: git(),
      tests: null,
      changes: {
        state: 'available',
        branch: 'main',
        from: HEAD,
        total: 1,
        commits: [],
        files: 3,
        migrations: 2,
      },
      policies: {
        backup: 'required-before-deploy',
        migrations: 'before-deploy',
        rollback: 'manual-restore',
      },
      health: 'degraded',
    });
    expect(item(items, 'migrations')?.detail).toContain('antes do deploy');
    expect(item(items, 'backup')?.tone).toBe('warn');
    expect(item(items, 'health')?.label).toMatch(/degradada/);
  });
});
