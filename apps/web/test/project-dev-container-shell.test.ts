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

describe('Dev Container no shell do projeto', () => {
  it('usa o ProjectDetailsView compartilhado e a API read-only', () => {
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
    expect(apiSource).toContain('/dev-container/lifecycle-preflight');
  });

  it('expõe a ferramenta sem lifecycle ou autoridade de execução', () => {
    expect(moreToolsSource).toContain("route.name === 'project-dev-container'");
    expect(moreToolsSource).toContain('<span>Dev Container</span>');
    expect(moreToolsSource).toContain(
      'environmentInstanceId ? { query: { environmentInstanceId } } : {}',
    );
    expect(projectDetailsSource).toContain(
      ':environment-instance-id="environmentInstanceId"',
    );
    expect(panelSource).toContain('Discovery e preflight somente leitura');
    expect(panelSource).toContain('Execução desabilitada neste estágio');
    expect(panelSource).not.toContain('devcontainer up');
    expect(panelSource).not.toContain('run-user-commands');
    expect(moreToolsSource).toContain('environmentInstanceId');
    expect(apiSource).not.toContain("method: 'POST'");
  });
});
