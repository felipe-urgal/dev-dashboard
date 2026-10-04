import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import { readRuntimeInfo } from '../fixtures/runtime-info';
import { runGit } from '../fixtures/server-harness';

interface WorktreeSnapshot {
  id: string;
  path: string;
  branch?: string;
  kind: 'main' | 'linked' | 'unknown';
  prunable: boolean;
  dirty?: boolean;
  environmentInstanceId?: string;
}

interface ManagedProcessSnapshot {
  projectId: string;
  environmentInstanceId?: string;
  kind: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
}

async function projectIdFromDashboard(page: Page): Promise<string> {
  await gotoBootstrapped(page, '/');
  const projectLink = page.getByRole('link', {
    name: 'Ver detalhes de sample-node-app',
    exact: true,
  });
  const href = await projectLink.getAttribute('href');
  if (!href) throw new Error('Projeto Node da fixture não foi encontrado.');

  const projectId = decodeURIComponent(
    new URL(href, 'http://localhost').pathname.split('/').at(-1) ?? '',
  );
  if (!projectId) throw new Error('ID do projeto Node não pôde ser resolvido.');
  return projectId;
}

async function createWorktree(
  page: Page,
  branch: string,
  directoryName: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Novo worktree' }).click();
  await page.getByLabel('Nova branch', { exact: true }).check();
  await page.getByLabel('Nome da nova branch').fill(branch);
  await page.getByLabel('Diretório', { exact: false }).fill(directoryName);
  await page.getByRole('button', { name: 'Criar worktree' }).click();
  await expect(page.getByText('Worktree criado.')).toBeVisible();
}

async function fetchWorktrees(
  page: Page,
  projectId: string,
): Promise<WorktreeSnapshot[]> {
  return page.evaluate(async (requestedProjectId) => {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(requestedProjectId)}/worktrees`,
    );
    if (!response.ok) {
      throw new Error(`Falha ao listar worktrees: ${response.status}`);
    }
    const payload = (await response.json()) as {
      inspection: { worktrees: WorktreeSnapshot[] };
    };
    return payload.inspection.worktrees;
  }, projectId);
}

async function fetchServerProcesses(
  page: Page,
  projectId: string,
): Promise<ManagedProcessSnapshot[]> {
  return page.evaluate(async (requestedProjectId) => {
    const params = new URLSearchParams({
      projectId: requestedProjectId,
      kind: 'server',
    });
    const response = await fetch(`/api/processes?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Falha ao listar processos: ${response.status}`);
    }
    const payload = (await response.json()) as {
      processes: ManagedProcessSnapshot[];
    };
    return payload.processes;
  }, projectId);
}

async function startEnvironmentServer(
  page: Page,
  projectId: string,
  environmentInstanceId: string,
): Promise<void> {
  await gotoBootstrapped(
    page,
    `/projects/${encodeURIComponent(projectId)}/server?environmentInstanceId=${encodeURIComponent(environmentInstanceId)}`,
  );
  const startButton = page.getByRole('button', { name: 'Iniciar servidor' });
  await expect(startButton).toBeVisible();
  await expect(startButton).toBeEnabled();
  await startButton.click();

  await expect
    .poll(
      async () => {
        const processes = await fetchServerProcesses(page, projectId);
        return processes.find(
          (process) => process.environmentInstanceId === environmentInstanceId,
        )?.status;
      },
      { timeout: 15_000 },
    )
    .toBe('running');

  await expect(page.locator('.server-status-label')).toContainText(
    'Executando',
  );
  await expect(page.getByRole('button', { name: 'Parar' })).toBeVisible();
}

async function stopEnvironmentServer(
  page: Page,
  projectId: string,
  environmentInstanceId: string,
): Promise<void> {
  await page.evaluate(
    async ({ requestedProjectId, requestedEnvironmentInstanceId }) => {
      const query = new URLSearchParams({
        environmentInstanceId: requestedEnvironmentInstanceId,
      });
      const response = await fetch(
        `/api/projects/${encodeURIComponent(requestedProjectId)}/process/stop?${query.toString()}`,
        { method: 'POST' },
      );
      if (!response.ok && response.status !== 404) {
        throw new Error(`Falha ao encerrar servidor E2E: ${response.status}`);
      }
    },
    {
      requestedProjectId: projectId,
      requestedEnvironmentInstanceId: environmentInstanceId,
    },
  );
}

test.describe('Worktrees como Environment Instances', () => {
  test('limpa worktree órfão sem afetar o outro ambiente', async ({ page }) => {
    const projectId = await projectIdFromDashboard(page);
    const branchA = 'feature/e2e-worktree-a';
    const branchB = 'feature/e2e-worktree-b';
    const directoryA = 'sample-node-app-e2e-worktree-a';
    const directoryB = 'sample-node-app-e2e-worktree-b';

    await gotoBootstrapped(
      page,
      `/projects/${encodeURIComponent(projectId)}/worktrees`,
    );
    await expect(
      page.getByRole('button', { name: 'Novo worktree' }),
    ).toBeVisible();

    await createWorktree(page, branchA, directoryA);
    await createWorktree(page, branchB, directoryB);

    const worktrees = await fetchWorktrees(page, projectId);
    const worktreeA = worktrees.find((worktree) => worktree.branch === branchA);
    const worktreeB = worktrees.find((worktree) => worktree.branch === branchB);

    expect(worktreeA?.environmentInstanceId).toBeTruthy();
    expect(worktreeB?.environmentInstanceId).toBeTruthy();
    if (
      !worktreeA?.environmentInstanceId ||
      !worktreeB?.environmentInstanceId
    ) {
      throw new Error(
        'Environment Instances dos linked worktrees não foram expostas.',
      );
    }

    const runtimeInfo = await readRuntimeInfo();
    expect(path.dirname(path.resolve(worktreeA.path))).toBe(
      path.resolve(runtimeInfo.workspaceDirectory),
    );
    expect(path.dirname(path.resolve(worktreeB.path))).toBe(
      path.resolve(runtimeInfo.workspaceDirectory),
    );

    try {
      await writeFile(
        path.join(worktreeB.path, '.env'),
        'WORKTREE_ENV_MARKER=from-worktree\n',
        'utf8',
      );
      await gotoBootstrapped(
        page,
        `/projects/${encodeURIComponent(projectId)}/environment?environmentInstanceId=${encodeURIComponent(worktreeB.environmentInstanceId)}`,
      );
      await expect(
        page.getByRole('rowheader', { name: 'WORKTREE_ENV_MARKER' }),
      ).toBeVisible();
      await expect(page.getByText('from-worktree')).toBeVisible();
      await expect(page.getByText('PUBLIC_API_URL')).toHaveCount(0);

      await startEnvironmentServer(
        page,
        projectId,
        worktreeA.environmentInstanceId,
      );
      await startEnvironmentServer(
        page,
        projectId,
        worktreeB.environmentInstanceId,
      );

      let serverProcesses = await fetchServerProcesses(page, projectId);
      expect(
        serverProcesses.find(
          (process) =>
            process.environmentInstanceId === worktreeA.environmentInstanceId,
        )?.status,
      ).toBe('running');
      expect(
        serverProcesses.find(
          (process) =>
            process.environmentInstanceId === worktreeB.environmentInstanceId,
        )?.status,
      ).toBe('running');

      await gotoBootstrapped(
        page,
        `/projects/${encodeURIComponent(projectId)}/worktrees`,
      );
      await expect(page.getByText(branchA, { exact: true })).toBeVisible();
      await expect(page.getByText(branchB, { exact: true })).toBeVisible();

      await rm(worktreeA.path, { recursive: true, force: true });

      const refreshResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname ===
            `/api/projects/${encodeURIComponent(projectId)}/worktrees`
        );
      });
      await page.getByRole('button', { name: 'Atualizar worktrees' }).click();
      expect((await refreshResponse).ok()).toBe(true);

      await expect
        .poll(async () => {
          const processes = await fetchServerProcesses(page, projectId);
          return processes.find(
            (process) =>
              process.environmentInstanceId === worktreeA.environmentInstanceId,
          )?.status;
        })
        .toBe('stopped');

      const orphanRow = page
        .locator('.worktree-row')
        .filter({ hasText: branchA });
      await expect(orphanRow.getByText('órfão')).toBeVisible();
      await orphanRow.getByRole('button', { name: 'Limpar registro' }).click();
      await expect(page.getByText('Registro órfão removido.')).toBeVisible();
      await expect
        .poll(async () => {
          const currentWorktrees = await fetchWorktrees(page, projectId);
          return currentWorktrees.some(
            (worktree) => worktree.branch === branchA,
          );
        })
        .toBe(false);

      serverProcesses = await fetchServerProcesses(page, projectId);
      expect(
        serverProcesses.find(
          (process) =>
            process.environmentInstanceId === worktreeB.environmentInstanceId,
        )?.status,
      ).toBe('running');

      await gotoBootstrapped(
        page,
        `/projects/${encodeURIComponent(projectId)}/server?environmentInstanceId=${encodeURIComponent(worktreeB.environmentInstanceId)}`,
      );
      await expect(page.locator('.server-status-label')).toContainText(
        'Executando',
      );
      await expect(page.getByRole('button', { name: 'Parar' })).toBeVisible();
    } finally {
      await stopEnvironmentServer(
        page,
        projectId,
        worktreeA.environmentInstanceId,
      );
      await stopEnvironmentServer(
        page,
        projectId,
        worktreeB.environmentInstanceId,
      );

      // Mantém a fixture determinística quando este cenário roda junto da suíte completa.
      const projectPath = path.join(
        runtimeInfo.workspaceDirectory,
        'sample-node-app',
      );
      for (const worktreePath of [worktreeA.path, worktreeB.path]) {
        await runGit(projectPath, [
          'worktree',
          'remove',
          '--',
          worktreePath,
        ]).catch(() => undefined);
      }
      await runGit(projectPath, ['worktree', 'prune']).catch(() => undefined);
      for (const branch of [branchA, branchB]) {
        await runGit(projectPath, ['branch', '-d', branch]).catch(
          () => undefined,
        );
      }
    }
  });

  test('bloqueia remoção quando o worktree possui alterações locais', async ({
    page,
  }) => {
    const projectId = await projectIdFromDashboard(page);
    const branch = 'feature/e2e-worktree-dirty';
    const directory = 'sample-node-app-e2e-worktree-dirty';

    await gotoBootstrapped(
      page,
      `/projects/${encodeURIComponent(projectId)}/worktrees`,
    );
    await createWorktree(page, branch, directory);

    const worktrees = await fetchWorktrees(page, projectId);
    const worktree = worktrees.find((candidate) => candidate.branch === branch);
    if (!worktree) throw new Error('Worktree dirty da fixture não foi criado.');

    const runtimeInfo = await readRuntimeInfo();
    const projectPath = path.join(
      runtimeInfo.workspaceDirectory,
      'sample-node-app',
    );

    try {
      await writeFile(
        path.join(worktree.path, '.e2e-worktree-dirty'),
        'alteração local\n',
        'utf8',
      );

      await page.getByRole('button', { name: 'Atualizar worktrees' }).click();

      const dirtyRow = page
        .locator('.worktree-row')
        .filter({ hasText: branch });
      await expect(
        dirtyRow.getByText('alterações', { exact: true }),
      ).toBeVisible();
      await expect(
        dirtyRow.getByText(
          'Possui alterações locais; resolva antes de remover.',
        ),
      ).toBeVisible();
      await expect(
        dirtyRow.getByRole('button', { name: 'Remover' }),
      ).toBeDisabled();
    } finally {
      await runGit(worktree.path, ['clean', '-fd']).catch(() => undefined);
      await runGit(projectPath, [
        'worktree',
        'remove',
        '--',
        worktree.path,
      ]).catch(() => undefined);
      await runGit(projectPath, ['branch', '-d', branch]).catch(
        () => undefined,
      );
    }
  });
});
