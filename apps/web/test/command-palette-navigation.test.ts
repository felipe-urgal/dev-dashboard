import { describe, expect, it } from 'vitest';

import {
  buildCommandPaletteNavigationItems,
  filterCommandPaletteNavigationItems,
} from '../src/command-palette-navigation';
import { parsePaletteQuery } from '../src/utils/command-palette';
import { makeProject, makeWorkspace } from './support/activity-fixtures';

describe('catálogo de navegação da command palette', () => {
  it('gera somente ferramentas compatíveis com as capabilities do projeto', () => {
    const project = makeProject({
      id: 'financeiro',
      name: 'Serviço financeiro',
      capabilities: ['git'],
    });

    const items = buildCommandPaletteNavigationItems(
      [project],
      [makeWorkspace()],
    );
    const projectTools = items.filter(
      (item) => item.projectId === project.id && item.group === 'Ferramentas',
    );

    expect(projectTools.map((item) => item.label)).toContain('Git');
    expect(projectTools.map((item) => item.label)).not.toContain('Servidor');
    expect(projectTools.map((item) => item.label)).not.toContain('Testes');
    expect(projectTools.map((item) => item.label)).not.toContain('Produção');
  });

  it('não gera ferramentas para projeto desativado', () => {
    const project = makeProject({
      id: 'desativado',
      enabled: false,
      capabilities: ['server', 'git', 'tests', 'production'],
    });

    const items = buildCommandPaletteNavigationItems([project], []);

    expect(
      items.filter(
        (item) => item.projectId === project.id && item.group === 'Ferramentas',
      ),
    ).toHaveLength(0);
    expect(items.find((item) => item.id === `project-${project.id}`)).toBeTruthy();
  });

  it('encontra ferramenta por nome do projeto e termo da ferramenta', () => {
    const items = buildCommandPaletteNavigationItems(
      [
        makeProject({
          id: 'financeiro',
          name: 'Serviço financeiro',
          capabilities: ['git'],
        }),
      ],
      [],
    );

    const result = filterCommandPaletteNavigationItems(
      items,
      parsePaletteQuery('financeiro git'),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: 'Git', projectId: 'financeiro' });
  });

  it('mantém prefixos de página e projeto sem oferecer modo de ação', () => {
    const items = buildCommandPaletteNavigationItems(
      [makeProject({ id: 'p1', name: 'Aplicação principal' })],
      [makeWorkspace()],
    );

    expect(
      filterCommandPaletteNavigationItems(items, parsePaletteQuery('/ banco')),
    ).toEqual([
      expect.objectContaining({ id: 'page-database', label: 'Banco de dados' }),
    ]);
    expect(
      filterCommandPaletteNavigationItems(items, parsePaletteQuery('@ aplic')),
    ).toEqual([
      expect.objectContaining({ id: 'project-p1', label: 'Aplicação principal' }),
    ]);
    expect(
      filterCommandPaletteNavigationItems(items, parsePaletteQuery('> iniciar')),
    ).toEqual([]);
  });
});
