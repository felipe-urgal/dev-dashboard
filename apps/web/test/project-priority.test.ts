import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

import {
  recentProjectIds,
  sortProjectsByPriority,
} from '../src/utils/project-priority';

function project(
  id: string,
  name: string,
  options: Partial<Project> = {},
): Project {
  return {
    id,
    name,
    path: `/projects/${id}`,
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-a',
    favorite: false,
    enabled: true,
    capabilities: [],
    ...options,
  };
}

test('mantém favoritos acima dos recentes e ordena os demais alfabeticamente', () => {
  const sorted = sortProjectsByPriority([
    project('z', 'Zulu'),
    project('recent-old', 'Beta', {
      lastAccessedAt: '2026-08-04T20:00:00.000Z',
    }),
    project('favorite', 'Álpha', { favorite: true }),
    project('recent-new', 'Gamma', {
      lastAccessedAt: '2026-08-04T21:00:00.000Z',
    }),
    project('a', 'Alpha'),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ['favorite', 'recent-new', 'recent-old', 'a', 'z'],
  );
});

test('expõe no máximo cinco recentes não favoritos', () => {
  const projects = Array.from({ length: 7 }, (_, index) =>
    project(`project-${index}`, `Project ${index}`, {
      lastAccessedAt: `2026-08-04T20:0${index}:00.000Z`,
    }),
  );
  projects.push(
    project('favorite', 'Favorite', {
      favorite: true,
      enabled: true,
      lastAccessedAt: '2026-08-04T23:00:00.000Z',
    }),
  );

  const ids = recentProjectIds(projects);
  assert.equal(ids.size, 5);
  assert.equal(ids.has('favorite'), false);
  assert.equal(ids.has('project-6'), true);
  assert.equal(ids.has('project-0'), false);
});
