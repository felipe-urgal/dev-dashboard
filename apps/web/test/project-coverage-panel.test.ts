import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type { ProjectCoverageSummary } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  fetchProjectCoverage: vi.fn(),
}));

vi.mock('../src/api', () => api);

import ProjectCoveragePanel from '../src/components/ProjectCoveragePanel.vue';

beforeEach(() => {
  api.fetchProjectCoverage.mockReset();
});

test('mostra estado vazio quando não há relatório de cobertura', async () => {
  api.fetchProjectCoverage.mockResolvedValue({
    available: false,
  } satisfies ProjectCoverageSummary);

  const wrapper = mount(ProjectCoveragePanel, { props: { projectId: 'p1' } });
  await flushPromises();

  assert.match(wrapper.text(), /Nenhum relatório encontrado/);
  assert.deepEqual(api.fetchProjectCoverage.mock.calls[0], ['p1']);
});

test('mostra os percentuais totais e a tabela por arquivo quando disponível', async () => {
  api.fetchProjectCoverage.mockResolvedValue({
    available: true,
    generatedAt: '2026-08-06T10:00:00.000Z',
    total: {
      statements: { total: 10, covered: 9, pct: 90 },
      branches: { total: 8, covered: 4, pct: 50 },
      functions: { total: 5, covered: 1, pct: 20 },
      lines: { total: 10, covered: 9, pct: 90 },
    },
    files: [
      {
        path: 'src/app.ts',
        statements: { total: 10, covered: 9, pct: 90 },
        branches: { total: 8, covered: 4, pct: 50 },
        functions: { total: 5, covered: 1, pct: 20 },
        lines: { total: 10, covered: 9, pct: 90 },
      },
    ],
  } satisfies ProjectCoverageSummary);

  const wrapper = mount(ProjectCoveragePanel, { props: { projectId: 'p1' } });
  await flushPromises();

  assert.match(wrapper.text(), /90%/);
  assert.match(wrapper.text(), /50%/);
  assert.match(wrapper.text(), /20%/);
  assert.match(wrapper.text(), /src\/app\.ts/);
  assert.equal(wrapper.findAll('.coverage-table tbody tr').length, 1);
});

test('mostra mensagem de erro quando a API falha', async () => {
  api.fetchProjectCoverage.mockRejectedValue(
    new Error('Não foi possível carregar a cobertura de testes.'),
  );

  const wrapper = mount(ProjectCoveragePanel, { props: { projectId: 'p1' } });
  await flushPromises();

  assert.match(wrapper.text(), /Não foi possível carregar a cobertura/);
});

test('recarrega ao trocar de projeto', async () => {
  api.fetchProjectCoverage.mockResolvedValue({
    available: false,
  } satisfies ProjectCoverageSummary);

  const wrapper = mount(ProjectCoveragePanel, { props: { projectId: 'p1' } });
  await flushPromises();
  assert.equal(api.fetchProjectCoverage.mock.calls.length, 1);

  await wrapper.setProps({ projectId: 'p2' });
  await flushPromises();

  assert.equal(api.fetchProjectCoverage.mock.calls.length, 2);
  assert.deepEqual(api.fetchProjectCoverage.mock.calls[1], ['p2']);
});
