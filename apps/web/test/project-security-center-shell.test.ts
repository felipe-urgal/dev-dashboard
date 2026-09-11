import { existsSync, readFileSync } from 'node:fs';
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
const dedicatedSecurityView = resolve(
  webRoot,
  'src/views/ProjectSecurityCenterView.vue',
);

describe('shell do Security Center', () => {
  it('mantém a rota de Segurança dentro de ProjectDetailsView', () => {
    expect(routerSource).toMatch(
      /path: '\/projects\/:projectId\/security'[\s\S]*?name: 'project-security-center'[\s\S]*?import\('\.\.\/views\/ProjectDetailsView\.vue'\)/,
    );
    expect(routerSource).not.toContain(
      "import('../views/ProjectSecurityCenterView.vue')",
    );
    expect(existsSync(dedicatedSecurityView)).toBe(false);
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
