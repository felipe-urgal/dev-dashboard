import type { Project } from '@dev-dashboard/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/api', async () => {
  const actual =
    await vi.importActual<typeof import('../src/api')>('../src/api');

  return {
    ...actual,
    recordProjectAccess: vi.fn(),
  };
});

import { recordProjectAccess } from '../src/api';
import { dashboardStore } from '../src/stores/dashboard';
import {
  recordProjectVisit,
  resetProjectVisitDeduplication,
} from '../src/stores/project-recents';

const firstProject: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Project One',
  path: '/tmp/workspace-1/project-1',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['server'],
};

const secondProject: Project = {
  id: 'project-2',
  workspaceId: 'workspace-2',
  name: 'Project Two',
  path: '/tmp/workspace-2/project-2',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['server'],
};

const recordProjectAccessMock = vi.mocked(recordProjectAccess);

function seedDashboard(): void {
  dashboardStore.projects.value = [firstProject, secondProject];
  dashboardStore.projectsByWorkspace.value = {
    'workspace-1': [firstProject],
    'workspace-2': [secondProject],
  };
}

describe('project recents', () => {
  beforeEach(() => {
    resetProjectVisitDeduplication();
    recordProjectAccessMock.mockReset();
    seedDashboard();
  });

  afterEach(() => {
    resetProjectVisitDeduplication();
    dashboardStore.projects.value = [];
    dashboardStore.projectsByWorkspace.value = {};
  });

  it('ignora visitas sem project id', async () => {
    await recordProjectVisit('');

    expect(recordProjectAccessMock).not.toHaveBeenCalled();
  });

  it('deduplica visitas consecutivas ao mesmo projeto', async () => {
    recordProjectAccessMock.mockResolvedValue(firstProject);

    await recordProjectVisit(firstProject.id);
    await recordProjectVisit(firstProject.id);

    expect(recordProjectAccessMock).toHaveBeenCalledTimes(1);
    expect(recordProjectAccessMock).toHaveBeenCalledWith(firstProject.id);
  });

  it('propaga o projeto atualizado para as coleções visíveis do dashboard', async () => {
    const updatedProject: Project = {
      ...firstProject,
      name: 'Project One Updated',
    };
    recordProjectAccessMock.mockResolvedValue(updatedProject);

    await recordProjectVisit(firstProject.id);

    expect(dashboardStore.projects.value).toEqual([
      updatedProject,
      secondProject,
    ]);
    expect(dashboardStore.projectsByWorkspace.value).toEqual({
      'workspace-1': [updatedProject],
      'workspace-2': [secondProject],
    });
  });

  it('libera uma nova tentativa quando o registro complementar falha', async () => {
    const updatedProject: Project = {
      ...firstProject,
      name: 'Project One Retried',
    };
    recordProjectAccessMock
      .mockRejectedValueOnce(new Error('API indisponível'))
      .mockResolvedValueOnce(updatedProject);

    await expect(recordProjectVisit(firstProject.id)).resolves.toBeUndefined();
    await expect(recordProjectVisit(firstProject.id)).resolves.toBeUndefined();

    expect(recordProjectAccessMock).toHaveBeenCalledTimes(2);
    expect(dashboardStore.projects.value[0]).toEqual(updatedProject);
  });
});
