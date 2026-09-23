import { expect, test, type Route } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

interface TaskRecord {
  task: {
    id: string;
    projectId: string;
    environmentInstanceId: string;
    state:
      | 'queued'
      | 'running'
      | 'checkpoint'
      | 'review'
      | 'blocked'
      | 'failed'
      | 'completed'
      | 'cancelled';
    summary: string;
    requestedCapabilities: string[];
    createdAt: string;
    updatedAt: string;
  };
  version: number;
}

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test.describe('Qualificação da aba Agente', () => {
  test('task -> autorização -> checkpoint -> continuação -> conclusão', async ({
    page,
  }) => {
    const observedAt = '2026-09-23T13:30:00.000Z';
    let projectId = '';
    let task: TaskRecord | null = null;
    let granted = false;
    let checkpointOpen = false;
    let executions = 0;

    await page.route('**/api/agent/providers', (route) =>
      json(route, {
        providers: [
          {
            providerId: 'automatic',
            availability: 'available',
            observedAt,
          },
          {
            providerId: 'codex',
            availability: 'available',
            observedAt,
            version: 'qualification-fixture',
          },
          {
            providerId: 'claude-code',
            availability: 'available',
            observedAt,
            version: 'qualification-fixture',
          },
          {
            providerId: 'chatgpt-browser',
            availability: 'available',
            observedAt,
            version: 'qualification-fixture',
          },
        ],
      }),
    );

    await page.route('**/api/projects/*/task-contexts', (route) =>
      json(route, { contexts: [] }),
    );

    await page.route('**/api/projects/*/agent/tasks', async (route) => {
      const request = route.request();
      const parts = new URL(request.url()).pathname.split('/');
      projectId = decodeURIComponent(parts[3] ?? '');

      if (request.method() === 'GET') {
        await json(route, { tasks: task ? [task] : [] });
        return;
      }

      const input = request.postDataJSON() as {
        summary: string;
        requestedCapabilities: string[];
      };
      task = {
        version: 1,
        task: {
          id: 'qualification-task',
          projectId,
          environmentInstanceId: `environment:primary:${projectId}`,
          state: 'queued',
          summary: input.summary,
          requestedCapabilities: input.requestedCapabilities,
          createdAt: observedAt,
          updatedAt: observedAt,
        },
      };
      await json(route, { task });
    });

    await page.route(
      '**/api/projects/*/agent/tasks/qualification-task/status',
      (route) =>
        json(route, {
          task,
          runtime: {
            taskId: 'qualification-task',
            projectId,
            canonicalVersion: task?.version ?? 1,
            state: 'idle',
            attempts: executions,
            updatedAt: observedAt,
          },
        }),
    );

    await page.route(
      '**/api/projects/*/agent/tasks/qualification-task/activity',
      (route) =>
        json(route, {
          authorizations: granted
            ? [
                {
                  taskId: 'qualification-task',
                  capability: 'workspace:write',
                  granted: true,
                  observedAt,
                },
              ]
            : [],
          checkpoints: checkpointOpen
            ? [
                {
                  id: 'checkpoint-1',
                  taskId: 'qualification-task',
                  executionId: 'execution-1',
                  status: 'pending',
                  summary: 'Confirmar continuação após review',
                  requiredCapabilities: ['workspace:write'],
                  createdAt: observedAt,
                },
              ]
            : [],
          events: [
            {
              id: 'event-1',
              taskId: 'qualification-task',
              providerId: 'codex',
              type: 'task-state',
              summary: 'Qualification fixture.',
              occurredAt: observedAt,
            },
          ],
          evidence:
            executions >= 2
              ? [
                  {
                    id: 'evidence-1',
                    taskId: 'qualification-task',
                    executionId: 'execution-2',
                    kind: 'test',
                    summary: 'Qualification tests passed.',
                    observedAt,
                  },
                ]
              : [],
        }),
    );

    await page.route(
      '**/api/projects/*/agent/tasks/qualification-task/authorizations',
      async (route) => {
        granted = (route.request().postDataJSON() as { granted: boolean })
          .granted;
        await json(route, {
          taskId: 'qualification-task',
          capability: 'workspace:write',
          granted,
          observedAt,
        });
      },
    );

    await page.route(
      '**/api/projects/*/agent/tasks/qualification-task/executions',
      async (route) => {
        executions += 1;
        if (!task) throw new Error('Task fixture missing.');

        if (executions === 1) {
          checkpointOpen = true;
          task = {
            version: 2,
            task: {
              ...task.task,
              state: 'checkpoint',
              updatedAt: observedAt,
            },
          };
          await json(route, {
            execution: {
              id: 'execution-1',
              taskId: task.task.id,
              projectId,
              environmentInstanceId: task.task.environmentInstanceId,
              requestedProviderId: 'automatic',
              providerId: 'codex',
              state: 'checkpoint',
              startedAt: observedAt,
              finishedAt: observedAt,
            },
            task,
            providerResult: {
              providerId: 'codex',
              outcome: 'checkpoint',
              summary: 'Checkpoint requested.',
            },
            checkpoint: {
              id: 'checkpoint-1',
              taskId: task.task.id,
              executionId: 'execution-1',
              status: 'pending',
              summary: 'Confirmar continuação após review',
              requiredCapabilities: ['workspace:write'],
              createdAt: observedAt,
            },
          });
          return;
        }

        checkpointOpen = false;
        task = {
          version: 4,
          task: {
            ...task.task,
            state: 'completed',
            updatedAt: observedAt,
          },
        };
        await json(route, {
          execution: {
            id: 'execution-2',
            taskId: task.task.id,
            projectId,
            environmentInstanceId: task.task.environmentInstanceId,
            requestedProviderId: 'automatic',
            providerId: 'codex',
            state: 'succeeded',
            startedAt: observedAt,
            finishedAt: observedAt,
          },
          task,
          providerResult: {
            providerId: 'codex',
            outcome: 'succeeded',
            summary: 'Qualification completed.',
            evidence: [
              {
                id: 'evidence-1',
                taskId: task.task.id,
                executionId: 'execution-2',
                kind: 'test',
                summary: 'Qualification tests passed.',
                observedAt,
              },
            ],
          },
        });
      },
    );

    await page.route(
      '**/api/projects/*/agent/tasks/qualification-task/checkpoints/checkpoint-1/resolve',
      async (route) => {
        checkpointOpen = false;
        if (!task) throw new Error('Task fixture missing.');
        task = {
          version: 3,
          task: {
            ...task.task,
            state: 'queued',
            continuationInstruction: 'Continue após aprovação.',
            updatedAt: observedAt,
          } as TaskRecord['task'] & { continuationInstruction?: string },
        };
        await json(route, {
          task,
          checkpoint: {
            id: 'checkpoint-1',
            taskId: task.task.id,
            executionId: 'execution-1',
            status: 'approved',
            summary: 'Confirmar continuação após review',
            requiredCapabilities: ['workspace:write'],
            createdAt: observedAt,
            resolvedAt: observedAt,
            continuationInstruction: 'Continue após aprovação.',
          },
        });
      },
    );

    await gotoBootstrapped(page, '/');
    const projectHref = await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .getAttribute('href');
    if (!projectHref) throw new Error('Projeto de fixture não encontrado.');
    projectId = decodeURIComponent(
      new URL(projectHref, 'http://localhost').pathname.split('/').at(-1) ?? '',
    );

    await gotoBootstrapped(page, `/projects/${projectId}/agent`);

    await page
      .getByLabel('Instrução para nova task do Agente')
      .fill('Implementar fluxo de qualificação');
    await page.getByRole('button', { name: 'Criar task' }).click();

    await expect(
      page.getByText('Implementar fluxo de qualificação', { exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Autorizar' }).click();
    await expect(page.getByText('Concedida', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Executar' }).click();
    await expect(
      page.getByRole('region', { name: 'Checkpoint pendente' }),
    ).toBeVisible();

    await page
      .getByLabel('Instrução de continuação do checkpoint')
      .fill('Continue após aprovação.');
    await page.getByRole('button', { name: 'Aprovar' }).click();

    await page.getByRole('button', { name: 'Executar' }).click();

    await expect(page.getByText('Concluída', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Qualification tests passed.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Codex', { exact: true })).toBeVisible();
    expect(executions).toBe(2);
  });
});
