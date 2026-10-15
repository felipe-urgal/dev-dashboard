import { describe, expect, it } from 'vitest';

import { buildCommandPaletteNavigationItems } from '../src/command-palette-navigation';
import {
  PROJECT_TOOLS,
  buildProjectToolRoute,
  projectToolRoute,
  findProjectTool,
  listProjectTools,
} from '../src/project-tools';
import { router } from '../src/router';
import { makeProject } from './support/activity-fixtures';

const fullProject = makeProject({
  id: 'p1',
  type: 'rails',
  capabilities: ['server', 'git', 'tests', 'production'],
});
const detection = { sidekiqDetected: true, webpackDetected: true };

describe('registry de Project Tools', () => {
  it('aponta todo route name para uma rota real do router', () => {
    for (const tool of PROJECT_TOOLS) {
      expect(router.hasRoute(tool.routeName), tool.id).toBe(true);
    }
  });

  it('usa ids únicos', () => {
    const ids = PROJECT_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserva environmentInstanceId só em ferramentas environment-aware', () => {
    const environmentId = 'env-1';
    for (const tool of PROJECT_TOOLS) {
      const to = buildProjectToolRoute(tool, 'p1', environmentId) as {
        query?: Record<string, string>;
      };
      if (tool.environmentAware) {
        expect(to.query?.environmentInstanceId, tool.id).toBe(environmentId);
      } else {
        expect(to.query?.environmentInstanceId, tool.id).toBeUndefined();
      }
    }
    expect(findProjectTool('dependencies')?.environmentAware).toBe(true);
  });

  it('palette descobre toda ferramenta da sidebar, exceto as dependentes de detecção', () => {
    const sidebarIds = listProjectTools(fullProject, detection)
      .filter((tool) => tool.sidebar !== false && !tool.requiresDetection)
      .map((tool) => tool.id);
    const paletteIds = buildCommandPaletteNavigationItems([fullProject], [])
      .filter((entry) => entry.group === 'Ferramentas')
      .map((entry) => entry.id.replace('project-p1-', ''));

    expect(paletteIds).toEqual(expect.arrayContaining(sidebarIds));
  });

  it('palette mantém o ambiente ativo somente para o projeto em contexto', () => {
    const other = makeProject({ id: 'p2', capabilities: [] });
    const items = buildCommandPaletteNavigationItems([fullProject, other], [], {
      projectId: 'p1',
      environmentInstanceId: 'env-1',
    });
    const to = (id: string) =>
      items.find((entry) => entry.id === id)?.to as {
        query?: Record<string, string>;
      };

    expect(to('project-p1-dependencies').query).toEqual({
      environmentInstanceId: 'env-1',
    });
    expect(to('project-p1-readme').query).toBeUndefined();
    expect(to('project-p2-terminal').query).toBeUndefined();
  });

  it('workspace não aponta para hash inexistente', () => {
    const items = buildCommandPaletteNavigationItems(
      [],
      [{ id: 'w1', name: 'W', path: '/w' } as never],
    );
    expect(items.find((entry) => entry.group === 'Workspaces')?.to).toEqual({
      name: 'dashboard',
      hash: '#overview',
    });
  });

  it('troca entre ferramentas environment-aware mantém o mesmo ambiente', () => {
    const ids = ['server', 'terminal', 'dependencies', 'compose', 'doctor'];
    for (const id of ids) {
      const to = projectToolRoute(id, 'p1', { environmentInstanceId: 'env-9' });
      expect(to.query, id).toEqual({ environmentInstanceId: 'env-9' });
    }
  });

  it('não propaga taskId ao navegar para outra ferramenta', () => {
    const to = projectToolRoute('agent', 'p1', {
      environmentInstanceId: 'env-1',
    });
    expect(to.query).toEqual({ environmentInstanceId: 'env-1' });
    expect(to.query).not.toHaveProperty('taskId');
  });

  it('falha explicitamente para ferramenta desconhecida', () => {
    expect(() => projectToolRoute('inexistente', 'p1')).toThrow(/desconhecida/);
  });
});
