import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(
  new URL('../src/router/index.ts', import.meta.url),
  'utf8',
);
const projectDetailsSource = readFileSync(
  new URL('../src/views/ProjectDetailsView.vue', import.meta.url),
  'utf8',
);
const moreToolsSource = readFileSync(
  new URL('../src/components/ProjectDetailsMoreTools.vue', import.meta.url),
  'utf8',
);

describe('shell do Security Center', () => {
  it('mantém a rota de Segurança dentro de ProjectDetailsView', () => {
    expect(routerSource).toMatch(
      /path: '\/projects\/:projectId\/security'[\s\S]*?name: 'project-security-center'[\s\S]*?import\('\.\.\/views\/ProjectDetailsView\.vue'\)/,
    );
    expect(routerSource).not.toContain(
      "import('../views/ProjectSecurityCenterView.vue')",
    );
  });

  it('renderiza o painel de Segurança na cadeia de ferramentas compartilhada', () => {
    expect(projectDetailsSource).toContain(
      "import('../components/ProjectSecurityCenterPanel.vue')",
    );
    expect(projectDetailsSource).toContain(
      "route.name === 'project-security-center'",
    );
    expect(projectDetailsSource).toContain(
      '<ProjectSecurityCenterPanel\n        v-else-if="isSecurityRoute"',
    );
  });

  it('mantém Segurança como aba do projeto', () => {
    expect(moreToolsSource).toContain(
      "route.name === 'project-security-center'",
    );
    expect(moreToolsSource).toContain('<span>Segurança</span>');
  });
});
