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
const dedicatedLocalCiView = resolve(
  webRoot,
  'src/views/ProjectLocalCiView.vue',
);

describe('shell do Local CI', () => {
  it('mantém a rota Local CI no shell de ProjectDetailsView', () => {
    expect(routerSource).toMatch(
      /path: '\/projects\/:projectId\/local-ci'[\s\S]*?name: 'project-local-ci'[\s\S]*?import\('\.\.\/views\/ProjectDetailsView\.vue'\)/,
    );
    expect(routerSource).not.toContain(
      "import('../views/ProjectLocalCiView.vue')",
    );
    expect(existsSync(dedicatedLocalCiView)).toBe(false);
  });

  it('renderiza o painel Local CI na cadeia compartilhada', () => {
    expect(projectDetailsSource).toContain(
      "import('../components/ProjectLocalCiPanel.vue')",
    );
    expect(projectDetailsSource).toContain("route.name === 'project-local-ci'");
    expect(projectDetailsSource).toContain(
      '<ProjectLocalCiPanel\n        v-else-if="isLocalCiRoute"',
    );
  });

  it('mantém Local CI como ferramenta do projeto', () => {
    expect(moreToolsSource).toContain("route.name === 'project-local-ci'");
    expect(moreToolsSource).toContain('<span>Local CI</span>');
  });
});
