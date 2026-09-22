import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const routerSource = readFileSync(
  resolve(webRoot, 'src/router/index.ts'),
  'utf8',
);
const projectDetailsSource = readFileSync(
  resolve(webRoot, 'src/views/ProjectDetailsView.vue'),
  'utf8',
);
const moreToolsSource = readFileSync(
  resolve(webRoot, 'src/components/ProjectDetailsMoreTools.vue'),
  'utf8',
);
const panelSource = readFileSync(
  resolve(webRoot, 'src/components/ProjectDockerComposePanel.vue'),
  'utf8',
);
const apiSource = readFileSync(
  resolve(webRoot, 'src/api/docker-compose.ts'),
  'utf8',
);

describe('Docker Compose no shell do projeto', () => {
  it('mantém Compose no ProjectDetailsView compartilhado', () => {
    expect(routerSource).toMatch(
      /path: '\/projects\/:projectId\/compose'[\s\S]*?name: 'project-compose'[\s\S]*?ProjectDetailsView\.vue/,
    );
    expect(projectDetailsSource).toContain(
      "import('../components/ProjectDockerComposePanel.vue')",
    );
    expect(projectDetailsSource).toContain("route.name === 'project-compose'");
  });

  it('expõe Compose como ferramenta do projeto', () => {
    expect(moreToolsSource).toContain("route.name === 'project-compose'");
    expect(moreToolsSource).toContain('<span>Compose</span>');
  });

  it('preserva a Environment Instance na navegação e no painel', () => {
    expect(moreToolsSource).toContain(
      'environmentInstanceId ? { query: { environmentInstanceId } } : {}',
    );
    expect(projectDetailsSource).toContain(
      ':environment-instance-id="environmentInstanceId"',
    );
    expect(panelSource).toContain('environmentInstanceId?: string');
    expect(apiSource).toContain('environmentInstanceId?: string');
    expect(apiSource).toContain("query.set('environmentInstanceId'");
  });

  it('expõe reconciliation de ownership sem ampliar autoridade do browser', () => {
    expect(apiSource).toContain(
      "state: 'unchanged' | 'released' | 'unavailable'",
    );
    expect(panelSource).toContain(
      'snapshot.value.ownership.reconciliation.diagnostic',
    );
    expect(panelSource).toContain(
      'O projeto está em modo somente leitura.',
    );
  });

  it('usa API estruturada sem enviar path, executable ou argv', () => {
    expect(apiSource).toContain('/docker-compose');
    expect(apiSource).not.toContain('executable');
    expect(apiSource).not.toContain('argv');
    expect(panelSource).toContain('Ações de serviço não estão disponíveis');
    expect(panelSource).toContain('Docker Compose');
    expect(panelSource).toContain('Ver logs');
  });

  it('segue o protótipo compacto com status, problemas e tabela de serviços', () => {
    expect(panelSource).toContain('compose-status-strip');
    expect(panelSource).toContain('Problemas detectados');
    expect(panelSource).toContain('Serviços · {{ config.services.length }}');
    expect(panelSource).toContain('placeholder="Buscar serviço..."');
    expect(panelSource).toContain('class="compose-service-table"');
    expect(panelSource).toContain('class="compose-row-menu"');
    expect(panelSource).not.toContain('compose-summary-card');
    expect(panelSource).not.toContain('compose-service-meta');
  });
});
