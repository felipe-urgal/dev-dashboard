import { describe, expect, it } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

import { resolveProjectSwitchTarget } from '../src/utils/project-switch';

function project(id: string, capabilities: Project['capabilities']): Project {
  return {
    id,
    workspaceId: 'w1',
    name: id,
    path: `/p/${id}`,
    type: 'rails',
    source: 'workspace',
    enabled: true,
    capabilities,
  };
}

describe('resolveProjectSwitchTarget', () => {
  it('mantém a ferramenta e a aba do Git no outro projeto', () => {
    expect(
      resolveProjectSwitchTarget(
        { routeName: 'project-git', query: { tab: 'branches' } },
        project('b', ['git', 'server']),
      ),
    ).toEqual({
      name: 'project-git',
      params: { projectId: 'b' },
      query: { tab: 'branches' },
    });
  });

  it('não leva o ambiente nem a tarefa do projeto anterior', () => {
    const target = resolveProjectSwitchTarget(
      {
        routeName: 'project-terminal',
        query: { environmentInstanceId: 'env-1', taskId: 't1' },
      },
      project('b', ['server']),
    );

    expect(target).toEqual({
      name: 'project-terminal',
      params: { projectId: 'b' },
    });
  });

  it('cai no Servidor, depois no Git, quando a ferramenta não existe no destino', () => {
    expect(
      resolveProjectSwitchTarget(
        { routeName: 'project-git', query: {} },
        project('b', ['server']),
      ),
    ).toMatchObject({ name: 'project-server' });

    expect(
      resolveProjectSwitchTarget(
        { routeName: 'project-tests', query: {} },
        project('c', ['git']),
      ),
    ).toMatchObject({ name: 'project-git' });
  });

  it('não repete Sidekiq e Webpack, que dependem de detecção por projeto', () => {
    expect(
      resolveProjectSwitchTarget(
        { routeName: 'project-rails-sidekiq', query: {} },
        project('b', ['server']),
      ),
    ).toMatchObject({ name: 'project-server' });
  });
});
