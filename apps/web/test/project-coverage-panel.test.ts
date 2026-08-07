import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type {
  ProjectCoverageHistory,
  ProjectCoverageSummary,
} from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  fetchProjectCoverage: vi.fn(),
  fetchProjectCoverageHistory: vi.fn(),
}));

vi.mock('../src/api', () => api);

import ProjectCoveragePanel from '../src/components/ProjectCoveragePanel.vue';

beforeEach(() => {
  api.fetchProjectCoverage.mockReset();
  api.fetchProjectCoverageHistory.mockReset();
  api.fetchProjectCoverageHistory.mockResolvedValue({
    items: [],
    total: 0,
  } satisfies ProjectCoverageHistory);
});

test('não renderiza o painel quando não há relatório de cobertura', async () => {
  api.fetchProjectCoverage.mockResolvedValue({
    available: false,
  } satisfies ProjectCoverageSummary);

  const wrapper = mount(ProjectCoveragePanel, { props: { projectId: 'p1' } });
  await flushPromises();

  assert.equal(wrapper.find('.coverage-panel').exists(), false);
  assert.deepEqual(api.fetchProjectCoverage.mock.calls[0], ['p1']);
  assert.equal(api.fetchProjectCoverageHistory.mock.calls.length, 0);
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

  assert.equal(wrapper.find('.coverage-panel').exists(), true);
  assert.equal(wrapper.find('.coverage-panel-heading svg').exists(), true);
  assert.match(wrapper.text(), /90%/);
  assert.match(wrapper.text(), /50%/);
  assert.match(wrapper.text(), /20%/);
  assert.match(wrapper.text(), /src\/app\.ts/);
  assert.equal(wrapper.findAll('.coverage-table tbody tr').length, 1);
});

test('mantém o painel oculto quando a API de cobertura falha', async () => {
  api.fetchProjectCoverage.mockRejectedValue(
    new Error('Não foi possível carregar a cobertura de testes.'),
  );

  const wrapper = mount(ProjectCoveragePanel, { props: { projectId: 'p1' } });
  await flushPromises();

  assert.equal(wrapper.find('.coverage-panel').exists(), false);
  assert.equal(api.fetchProjectCoverageHistory.mock.calls.length, 0);
});

test('também oculta o painel vazio em projetos Rails', async () => {
  api.fetchProjectCoverage.mockResolvedValue({
    available: false,
  } satisfies ProjectCoverageSummary);

  const wrapper = mount(ProjectCoveragePanel, {
    props: { projectId: 'p1', projectType: 'rails' },
  });
  await flushPromises();

  assert.equal(wrapper.find('.coverage-panel').exists(), false);
});

test('mostra o histórico de execuções quando há snapshots registrados', async () => {
  api.fetchProjectCoverage.mockResolvedValue({
    available: true,
    generatedAt: '2026-08-06T10:00:00.000Z',
    total: {
      statements: { total: 10, covered: 9, pct: 90 },
      branches: { total: 8, covered: 4, pct: 50 },
      functions: { total: 5, covered: 1, pct: 20 },
      lines: { total: 10, covered: 9, pct: 90 },
    },
    files: [],
  } satisfies ProjectCoverageSummary);
  api.fetchProjectCoverageHistory.mockResolvedValue({
    items: [
      {
        id: 'h2',
        generatedAt: '2026-08-06T10:00:00.000Z',
        recordedAt: '2026-08-06T10:00:01.000Z',
        total: {
          statements: { total: 10, covered: 9, pct: 90 },
          branches: { total: 8, covered: 4, pct: 50 },
          functions: { total: 5, covered: 1, pct: 20 },
          lines: { total: 10, covered: 9, pct: 90 },
        },
      },
      {
        id: 'h1',
        generatedAt: '2026-08-05T10:00:00.000Z',
        recordedAt: '2026-08-05T10:00:01.000Z',
        total: {
          statements: { total: 10, covered: 5, pct: 50 },
          branches: { total: 8, covered: 2, pct: 25 },
          functions: { total: 5, covered: 0, pct: 0 },
          lines: { total: 10, covered: 5, pct: 50 },
        },
      },
    ],
    total: 2,
  } satisfies ProjectCoverageHistory);

  const wrapper = mount(ProjectCoveragePanel, { props: { projectId: 'p1' } });
  await flushPromises();

  assert.match(wrapper.text(), /Histórico de execuções/);
  assert.equal(wrapper.findAll('.coverage-history tbody tr').length, 2);
  assert.deepEqual(api.fetchProjectCoverageHistory.mock.calls[0], ['p1']);
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
