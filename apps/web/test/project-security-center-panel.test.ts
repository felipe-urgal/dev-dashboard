import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const fetchSecurityCenterAvailability = vi.hoisted(() => vi.fn());
const scanProjectSecurityCenter = vi.hoisted(() => vi.fn());

vi.mock('../src/api/security-center', () => ({
  fetchSecurityCenterAvailability: (...args: unknown[]) =>
    fetchSecurityCenterAvailability(...args),
  scanProjectSecurityCenter: (...args: unknown[]) =>
    scanProjectSecurityCenter(...args),
}));

import ProjectSecurityCenterPanel from '../src/components/ProjectSecurityCenterPanel.vue';

const project: Project = {
  id: 'projeto-security',
  workspaceId: 'workspace-security',
  name: 'Projeto Security',
  path: '/tmp/projeto-security',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git'],
};

function availability(state: 'available' | 'missing' | 'unavailable') {
  return {
    provider: 'trivy',
    availability: {
      state,
      observedAt: '2026-09-11T14:33:00.000Z',
      ...(state === 'available' ? { version: '0.66.0' } : {}),
      ...(state === 'missing'
        ? { diagnostic: 'Trivy não está instalado no PATH da API.' }
        : {}),
    },
  };
}

describe('ProjectSecurityCenterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mantém ausência de evidência quando o scanner não está instalado', async () => {
    fetchSecurityCenterAvailability.mockResolvedValueOnce(
      availability('missing'),
    );

    const wrapper = mount(ProjectSecurityCenterPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Security Center');
    expect(wrapper.text()).toContain('Não instalado');
    expect(wrapper.text()).toContain('Trivy não está instalado no PATH da API.');
    expect(wrapper.text()).toContain('Não executado');
    expect(wrapper.text()).toContain('Somente sessão');
    expect(wrapper.text()).toContain('Triagem de riscos');
    expect(wrapper.text()).toContain('Sem scan nesta sessão');
    expect(
      wrapper
        .findAll('.security-center-severity strong')
        .map((metric) => metric.text()),
    ).toEqual(['—', '—', '—', '—', '—']);

    const button = wrapper.get('.security-center-scan-button');
    expect(button.attributes('disabled')).toBeDefined();
    expect(scanProjectSecurityCenter).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('deriva a triagem somente dos findings reais após um scan concluído', async () => {
    fetchSecurityCenterAvailability.mockResolvedValueOnce(
      availability('available'),
    );
    scanProjectSecurityCenter.mockResolvedValueOnce({
      provider: 'trivy',
      execution: {
        state: 'completed',
        observedAt: '2026-09-11T14:40:00.000Z',
        result: {
          provider: 'trivy',
          observedAt: '2026-09-11T14:40:00.000Z',
          findings: [
            {
              provider: 'trivy',
              category: 'misconfiguration',
              ruleId: 'LOW-1',
              severity: 'low',
              title: 'Low finding',
              file: 'z.yml',
              fingerprint: 'low',
              observedAt: '2026-09-11T14:40:00.000Z',
            },
            {
              provider: 'trivy',
              category: 'secret',
              ruleId: 'CRIT-1',
              severity: 'critical',
              title: 'Critical finding',
              file: 'a.env',
              line: 4,
              remediation: 'Remova o segredo e rotacione a credencial.',
              fingerprint: 'critical',
              observedAt: '2026-09-11T14:40:00.000Z',
            },
            {
              provider: 'trivy',
              category: 'misconfiguration',
              ruleId: 'MED-1',
              severity: 'medium',
              title: 'Medium finding',
              file: 'm.yml',
              fingerprint: 'medium',
              observedAt: '2026-09-11T14:40:00.000Z',
            },
            {
              provider: 'trivy',
              category: 'misconfiguration',
              ruleId: 'HIGH-1',
              severity: 'high',
              title: 'High finding',
              file: 'b.yml',
              fingerprint: 'high',
              observedAt: '2026-09-11T14:40:00.000Z',
            },
            {
              provider: 'trivy',
              category: 'misconfiguration',
              ruleId: 'UNK-1',
              severity: 'unknown',
              title: 'Unknown finding',
              file: 'u.yml',
              fingerprint: 'unknown',
              observedAt: '2026-09-11T14:40:00.000Z',
            },
          ],
        },
      },
    });

    const wrapper = mount(ProjectSecurityCenterPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.get('.security-center-scan-button').attributes('disabled')).toBeUndefined();
    await wrapper.get('.security-center-scan-button').trigger('click');
    await flushPromises();

    expect(scanProjectSecurityCenter).toHaveBeenCalledWith(project.id);
    expect(wrapper.text()).toContain('Concluído');
    expect(
      wrapper
        .findAll('.security-center-severity strong')
        .map((metric) => metric.text()),
    ).toEqual(['1', '1', '1', '1', '1']);

    const titles = wrapper
      .findAll('.security-center-finding-copy > strong')
      .map((finding) => finding.text());
    expect(titles).toEqual([
      'Critical finding',
      'High finding',
      'Medium finding',
      'Low finding',
      'Unknown finding',
    ]);
    expect(wrapper.text()).toContain('Secret · CRIT-1 · a.env:4');
    expect(wrapper.text()).toContain('Remova o segredo e rotacione a credencial.');

    wrapper.unmount();
  });

  it('mostra zeros somente depois de um scan concluído sem findings', async () => {
    fetchSecurityCenterAvailability.mockResolvedValueOnce(
      availability('available'),
    );
    scanProjectSecurityCenter.mockResolvedValueOnce({
      provider: 'trivy',
      execution: {
        state: 'completed',
        observedAt: '2026-09-11T14:42:00.000Z',
        result: {
          provider: 'trivy',
          observedAt: '2026-09-11T14:42:00.000Z',
          findings: [],
        },
      },
    });

    const wrapper = mount(ProjectSecurityCenterPanel, { props: { project } });
    await flushPromises();
    await wrapper.get('.security-center-scan-button').trigger('click');
    await flushPromises();

    expect(
      wrapper
        .findAll('.security-center-severity strong')
        .map((metric) => metric.text()),
    ).toEqual(['0', '0', '0', '0', '0']);
    expect(wrapper.text()).toContain('Nenhum finding encontrado');
    expect(wrapper.text()).toContain('0 finding(s)');

    wrapper.unmount();
  });

  it('mantém a triagem inconclusiva quando o provider falha', async () => {
    fetchSecurityCenterAvailability.mockResolvedValueOnce(
      availability('available'),
    );
    scanProjectSecurityCenter.mockResolvedValueOnce({
      provider: 'trivy',
      execution: {
        state: 'failed',
        observedAt: '2026-09-11T14:44:00.000Z',
        diagnostic: 'Trivy encerrou com erro.',
      },
    });

    const wrapper = mount(ProjectSecurityCenterPanel, { props: { project } });
    await flushPromises();
    await wrapper.get('.security-center-scan-button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Scan inconclusivo');
    expect(wrapper.text()).toContain('Trivy encerrou com erro.');
    expect(
      wrapper
        .findAll('.security-center-severity strong')
        .map((metric) => metric.text()),
    ).toEqual(['—', '—', '—', '—', '—']);

    wrapper.unmount();
  });
});
