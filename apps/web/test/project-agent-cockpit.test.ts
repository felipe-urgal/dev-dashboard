import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(
  resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
  'utf8',
);

describe('Project Agent cockpit', () => {
  it('preserva a hierarquia do protótipo aprovado', () => {
    const header = panel.indexOf('class="agent-cockpit-header"');
    const create = panel.indexOf(
      'class="agent-card agent-composer agent-create-card"',
    );
    const provider = panel.indexOf('class="agent-provider-panel agent-card"');
    const task = panel.indexOf('class="agent-card agent-task-overview"');
    const history = panel.indexOf('class="agent-card agent-recent-history"');
    const integrations = panel.indexOf(
      'class="agent-integrations-summary agent-card"',
    );

    expect(header).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(header);
    expect(provider).toBeGreaterThan(create);
    expect(task).toBeGreaterThan(provider);
    expect(history).toBeGreaterThan(task);
    expect(integrations).toBeGreaterThan(history);
  });

  it('mantém criação de task como ação primária e integrações recolhidas', () => {
    expect(panel).toContain('placeholder="Ex.: Adicionar um player de música');
    expect(panel).toContain('class="primary-button agent-create-button"');
    expect(panel).toContain('Criar task');
    expect(panel).toContain('<details');
    expect(panel).toContain('Gerenciar integrações');
    expect(panel).toContain('<ArrowRightIcon aria-hidden="true" />');
  });

  it('mantém doctor e revalidação no painel operacional lateral', () => {
    expect(panel).toContain('Status do provider');
    expect(panel).toContain('data-testid="provider-doctor"');
    expect(panel).toContain('@click="refreshProviders"');
    expect(panel).toContain('Revalidar conexão');
    expect(panel).toContain('Diagnóstico do ambiente');
  });
});
