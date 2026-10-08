import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';
import type {
  ReleaseReadinessCheck,
  ReleaseReadinessCheckId,
  ReleaseReadinessSnapshot,
  ReleaseReadinessState,
} from '../src/api/release-readiness';

const fetchReleaseReadiness = vi.hoisted(() => vi.fn());

vi.mock('../src/api/release-readiness', async () => {
  const actual = await vi.importActual('../src/api/release-readiness');
  return { ...actual, fetchReleaseReadiness };
});

import ProjectReleaseReadinessPanel from '../src/components/ProjectReleaseReadinessPanel.vue';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Dashboard',
  path: '/projects/dashboard',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git', 'server'],
};

const targets: Record<ReleaseReadinessCheckId, ReleaseReadinessCheck['action']> = {
  git: { label: 'Abrir Sincronização', target: 'synchronization' },
  tests: { label: 'Abrir Testes', target: 'tests' },
  'pull-request': { label: 'Abrir Pull Request', target: 'pull-request' },
  doctor: { label: 'Abrir Doctor', target: 'doctor' },
  migrations: { label: 'Abrir Migrations', target: 'migrations' },
  security: { label: 'Abrir Segurança', target: 'security' },
  production: { label: 'Abrir Produção', target: 'production' },
};

function check(
  id: ReleaseReadinessCheckId,
  state: ReleaseReadinessState,
  overrides: Partial<ReleaseReadinessCheck> = {},
): ReleaseReadinessCheck {
  return {
    id,
    state,
    summary: `Resumo de ${id}`,
    evidence: `Evidência de ${id}`,
    observedAt: '2026-09-06T16:59:00.000Z',
    action: targets[id],
    ...overrides,
  };
}

function snapshot(
  state: ReleaseReadinessState,
  checks: ReleaseReadinessCheck[],
): ReleaseReadinessSnapshot {
  return { state, checks, generatedAt: '2026-09-06T17:00:00.000Z' };
}

function mountPanel() {
  return mount(ProjectReleaseReadinessPanel, {
    props: { project },
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template:
            '<a class="router-link-stub" :data-name="to.name" :data-tab="to.query?.tab || \'\'"><slot /></a>',
        },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectReleaseReadinessPanel', () => {
  it('organiza checks, resume blockers sem reclassificar alertas e aponta para os domínios', async () => {
    fetchReleaseReadiness.mockResolvedValue(
      snapshot('block', [
        check('pull-request', 'warning'),
        check('doctor', 'pass'),
        check('security', 'warning'),
        check('production', 'pass'),
        check('migrations', 'block'),
        check('git', 'block'),
        check('tests', 'unknown'),
      ]),
    );

    const wrapper = mountPanel();
    await flushPromises();

    expect(fetchReleaseReadiness).toHaveBeenCalledWith(project.id);
    expect(wrapper.text()).toContain('2 bloqueios impedem a entrega.');
    expect(wrapper.text()).toContain('2 bloqueio(s)');
    expect(wrapper.text()).toContain('2 alerta(s)');
    expect(wrapper.text()).toContain('1 inconclusivo(s)');
    expect(wrapper.findAll('.readiness-check')).toHaveLength(7);
    expect(
      wrapper.findAll('.readiness-check-domain').map((node) => node.text()),
    ).toEqual([
      'Git',
      'Testes',
      'Pull Request',
      'Doctor',
      'Migrations',
      'Segurança',
      'Produção',
    ]);

    const links = wrapper.findAll('.router-link-stub');
    expect(links).toHaveLength(7);
    expect(links.map((link) => link.attributes('data-name'))).toEqual([
      'project-git',
      'project-tests',
      'project-git',
      'project-doctor',
      'project-migrations',
      'project-security-center',
      'project-production',
    ]);
    expect(links[0]?.attributes('data-tab')).toBe('sync');
    expect(links[2]?.attributes('data-tab')).toBe('pull-request');
    expect(links[5]?.attributes('aria-label')).toBe('Abrir Segurança');
    expect(wrapper.get('.readiness-refresh-button').text()).toContain('Atualizar');
  });

  it.each([
    {
      state: 'unknown' as const,
      checks: [check('git', 'pass'), check('tests', 'unknown')],
      expected: '1 check inconclusivo; entrega ainda não comprovada.',
    },
    {
      state: 'warning' as const,
      checks: [check('git', 'pass'), check('security', 'warning')],
      expected: '1 alerta requer atenção antes da entrega.',
    },
    {
      state: 'pass' as const,
      checks: [check('git', 'pass')],
      expected: 'Todos os checks aplicáveis estão comprovados.',
    },
  ])('usa um resumo coerente quando o estado é $state', async ({
    state,
    checks,
    expected,
  }) => {
    fetchReleaseReadiness.mockResolvedValue(snapshot(state, checks));

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain(expected);
    expect(wrapper.text()).not.toContain('Nenhum bloqueio impede a entrega');
    expect(wrapper.text()).toContain('0 bloqueio(s)');
  });

  it('exibe evidence e observedAt como texto seguro em detalhes nativos acessíveis', async () => {
    const untrusted = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    fetchReleaseReadiness.mockResolvedValue(
      snapshot('unknown', [
        check('tests', 'unknown', {
          summary: 'Resultado de testes está desatualizado',
          evidence: untrusted,
        }),
        check('security', 'unknown', {
          summary: 'Estado do Security Center indisponível',
          evidence: 'A fonte não pôde ser consultada nesta atualização.',
        }),
        check('git', 'block', { summary: 'Working tree possui alterações' }),
      ]),
    );

    const wrapper = mountPanel();
    await flushPromises();

    const details = wrapper.findAll('details');
    expect(details).toHaveLength(3);
    expect(details.every((item) => item.find('summary').exists())).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.text()).toContain(untrusted);
    expect(wrapper.text()).toContain('Evidência desatualizada');
    expect(wrapper.text()).toContain('Fonte indisponível');
    expect(wrapper.text()).toContain('Bloqueio confirmado');
    expect(wrapper.find('time').attributes('datetime')).toBe(
      '2026-09-06T16:59:00.000Z',
    );
    expect(wrapper.text()).toContain('Observado em');
    // Native details/summary provides keyboard and screen-reader disclosure.
    expect(details[0]?.element.tagName).toBe('DETAILS');
    expect(details[0]?.find('summary').element.tagName).toBe('SUMMARY');
  });

  it('mantém snapshot anterior durante refresh e troca apenas após resposta', async () => {
    const initial = snapshot('warning', [check('security', 'warning')]);
    const updated = snapshot('pass', [check('security', 'pass')]);
    let resolveRefresh!: (result: ReleaseReadinessSnapshot) => void;
    fetchReleaseReadiness
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(
        () =>
          new Promise<ReleaseReadinessSnapshot>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('.readiness-refresh-button').trigger('click');

    expect(wrapper.find('.readiness-card').exists()).toBe(true);
    expect(wrapper.text()).toContain('1 alerta requer atenção');
    expect(wrapper.text()).toContain('Atualizando…');
    expect(wrapper.get('.readiness-refresh-button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.empty-state').exists()).toBe(false);

    resolveRefresh(updated);
    await flushPromises();

    expect(wrapper.text()).toContain('Todos os checks aplicáveis estão comprovados.');
    expect(wrapper.text()).not.toContain('1 alerta requer atenção');
    expect(wrapper.get('.readiness-refresh-button').attributes('disabled')).toBeUndefined();
  });

  it('mantém evidência saudável e sinaliza erro em refresh sem apagar o snapshot', async () => {
    fetchReleaseReadiness
      .mockResolvedValueOnce(snapshot('pass', [check('git', 'pass')]))
      .mockRejectedValueOnce(new Error('Falha temporária'));

    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('.readiness-refresh-button').trigger('click');
    await flushPromises();

    expect(wrapper.find('.readiness-card').exists()).toBe(true);
    expect(wrapper.find('.readiness-check-domain').text()).toBe('Git');
    expect(wrapper.get('[role="alert"]').text()).toContain('Falha temporária');
    expect(wrapper.get('[role="alert"]').text()).toContain('snapshot anterior');
  });

  it('reflete falha isolada de uma fonte sem apagar checks saudáveis', async () => {
    fetchReleaseReadiness.mockResolvedValue(
      snapshot('unknown', [
        check('git', 'pass'),
        check('doctor', 'pass'),
        check('tests', 'unknown', {
          summary: 'Histórico de testes indisponível',
          evidence: 'A fonte não pôde ser consultada nesta atualização.',
        }),
      ]),
    );

    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.findAll('.readiness-check')).toHaveLength(3);
    expect(wrapper.text()).toContain('1 check inconclusivo');
    expect(wrapper.findAll('.readiness-check-status').map((s) => s.text())).toEqual([
      'Pronto',
      'Inconclusivo',
      'Pronto',
    ]);
  });

  it('não inventa check de produção para projeto sem contrato aplicável', async () => {
    fetchReleaseReadiness.mockResolvedValue(
      snapshot('pass', [check('git', 'pass'), check('tests', 'pass')]),
    );
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.text()).not.toContain('Produção');
    expect(wrapper.findAll('.readiness-check')).toHaveLength(2);
  });

  it('não mantém evidências do projeto anterior quando o projeto muda', async () => {
    const first = snapshot('pass', [check('git', 'pass')]);
    let resolveSecond!: (result: ReleaseReadinessSnapshot) => void;
    fetchReleaseReadiness
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(
        () =>
          new Promise<ReleaseReadinessSnapshot>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.setProps({ project: { ...project, id: 'project-2' } });

    expect(wrapper.find('.readiness-card').exists()).toBe(false);
    expect(wrapper.text()).toContain('Verificando readiness');
    resolveSecond(snapshot('warning', [check('security', 'warning')]));
    await flushPromises();
    expect(wrapper.text()).toContain('1 alerta requer atenção');
    expect(fetchReleaseReadiness).toHaveBeenLastCalledWith('project-2');
  });

  it('mantém falha inicial explícita e permite retry', async () => {
    fetchReleaseReadiness
      .mockRejectedValueOnce(new Error('Readiness indisponível'))
      .mockResolvedValueOnce(snapshot('pass', [check('git', 'pass')]));

    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.text()).toContain('Readiness indisponível');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(fetchReleaseReadiness).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Todos os checks aplicáveis estão comprovados.');
  });
});
