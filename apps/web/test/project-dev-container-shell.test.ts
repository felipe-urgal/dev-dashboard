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
  resolve(webRoot, 'src/components/ProjectDevContainerPanel.vue'),
  'utf8',
);
const apiSource = readFileSync(
  resolve(webRoot, 'src/api/dev-container.ts'),
  'utf8',
);
const terminalPanelSource = readFileSync(
  resolve(webRoot, 'src/components/ProjectTerminalPanel.vue'),
  'utf8',
);
const terminalApiSource = readFileSync(
  resolve(webRoot, 'src/api/terminal.ts'),
  'utf8',
);

describe('Dev Container no shell do projeto', () => {
  it('usa o ProjectDetailsView compartilhado e o preflight read-only', () => {
    expect(routerSource).toMatch(
      /path: '\/projects\/:projectId\/dev-container'[\s\S]*?name: 'project-dev-container'[\s\S]*?ProjectDetailsView\.vue/,
    );
    expect(projectDetailsSource).toContain(
      "import('../components/ProjectDevContainerPanel.vue')",
    );
    expect(projectDetailsSource).toContain(
      "route.name === 'project-dev-container'",
    );
    expect(apiSource).toContain('/dev-container/lifecycle-preflight');
    expect(panelSource).toContain('fetchDevContainerLifecyclePreflight');
  });

  it('expõe criação e rebuild confirmados sem autoridade de execução arbitrária', () => {
    expect(moreToolsSource).toContain("route.name === 'project-dev-container'");
    expect(moreToolsSource).toContain('<span>Dev Container</span>');
    expect(moreToolsSource).toContain(
      'environmentInstanceId ? { query: { environmentInstanceId } } : {}',
    );
    expect(projectDetailsSource).toContain(
      ':environment-instance-id="environmentInstanceId"',
    );
    expect(panelSource).toContain('Preflight somente leitura');
    expect(panelSource).toContain('Criar Dev Container');
    expect(panelSource).toContain('Confirmar criação');
    expect(panelSource).toContain('Rebuild');
    expect(panelSource).toContain('Confirmar rebuild');
    expect(panelSource).not.toContain('devcontainer up');
    expect(panelSource).not.toContain('run-user-commands');
    expect(moreToolsSource).toContain('environmentInstanceId');
    expect(apiSource).toContain('/dev-container/lifecycle-confirmation');
    expect(apiSource).toContain('/dev-container/start');
    expect(apiSource).toContain('/dev-container/rebuild');
    expect(apiSource).toContain("method: 'POST'");
    expect(apiSource).not.toContain('workspaceFolder');
    expect(apiSource).not.toContain('overrideConfigPath');
    expect(apiSource).not.toContain('ownershipToken');
  });

  it('leva a Environment Instance até o Terminal sem expor containerId no browser', () => {
    expect(projectDetailsSource).toContain("name: 'project-terminal'");
    expect(projectDetailsSource).toContain(
      ':environment-instance-id="environmentInstanceId"',
    );
    expect(terminalPanelSource).toContain('props.environmentInstanceId');
    expect(terminalApiSource).toContain('environmentInstanceId');
    expect(terminalApiSource).toContain('/terminal/${kind}/connect');
    expect(terminalApiSource).not.toContain('containerId');
    expect(terminalApiSource).not.toContain('runtimeId');
    expect(terminalPanelSource).not.toContain('devcontainer exec');
  });
});
