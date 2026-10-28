import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

import {
  recentProjectIds,
  sortProjectsByName,
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
    enabled: true,
    capabilities: [],
    ...options,
  };
}

test('ordena por recência e depois alfabeticamente', () => {
  const sorted = sortProjectsByPriority([
    project('z', 'Zulu'),
    project('recent-old', 'Beta', {
      lastAccessedAt: '2026-08-04T20:00:00.000Z',
    }),
    project('recent-new', 'Gamma', {
      lastAccessedAt: '2026-08-04T21:00:00.000Z',
    }),
    project('a', 'Alpha'),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ['recent-new', 'recent-old', 'a', 'z'],
  );
});

test('projetos desativados vão sempre para o final da lista', () => {
  const sorted = sortProjectsByPriority([
    project('disabled-recent', 'Zulu Desativado', {
      enabled: false,
      lastAccessedAt: '2026-08-05T00:00:00.000Z',
    }),
    project('z', 'Zulu'),
    project('a', 'Alpha'),
    project('disabled-old', 'Alpha Desativado', { enabled: false }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ['a', 'z', 'disabled-recent', 'disabled-old'],
  );
});

test('expõe no máximo cinco recentes', () => {
  const projects = Array.from({ length: 7 }, (_, index) =>
    project(`project-${index}`, `Project ${index}`, {
      lastAccessedAt: `2026-08-04T20:0${index}:00.000Z`,
    }),
  );

  const ids = recentProjectIds(projects);
  assert.equal(ids.size, 5);
  assert.equal(ids.has('project-6'), true);
  assert.equal(ids.has('project-0'), false);
});

test('ordem da Visão geral ignora recência: ativos primeiro e depois nome', () => {
  const sorted = sortProjectsByName([
    project('c', 'Charlie', { lastAccessedAt: '2026-10-28T10:00:00Z' }),
    project('x', 'Xray', { enabled: false }),
    project('b', 'Bravo'),
    project('a', 'Alpha'),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ['a', 'b', 'c', 'x'],
  );
});
