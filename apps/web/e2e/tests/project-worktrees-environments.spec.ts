import { rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import { readRuntimeInfo } from '../fixtures/runtime-info';

interface WorktreeSnapshot {
  id: string;
  path: string;
  branch?: string;
  kind: 'main' | 'linked' | 'unknown';
  prunable: boolean;
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
  await page.getByLabel('Branch', { exact: true }).fill(branch);
  await page.getByLabel('Diretório', { exact: false }).fill(directoryName);
  await page.getByLabel('Criar nova branch').check();
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
  await expect(page.getByText('Pronto para iniciar')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar servidor' }).click();
  await expect(page.locator('.server-running-badge')).toHaveText(
    'Em execução',
    {
      timeout: 15_000,
    },
  );
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
  test('cleanup após remoção externa encerra somente o ambiente removido', async ({
    page,
  }) => {
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
      page.getByRole('heading', { name: 'Worktrees' }),
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

    try {
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
      await expect(page.locator('.server-running-badge')).toHaveText(
        'Em execução',
      );
    } finally {
      await stopEnvironmentServer(
        page,
        projectId,
        worktreeB.environmentInstanceId,
      );
    }
  });
});
