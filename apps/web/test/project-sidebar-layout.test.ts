import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const redesignCss = readFileSync(
  resolve(webRoot, 'src/styles/features/project-details-redesign.css'),
  'utf8',
);

describe('project sidebar desktop layout', () => {
  it('mantém a navegação ancorada no topo quando submenus expandem', () => {
    expect(redesignCss).toMatch(
      /@media \(min-width: 901px\)[\s\S]*?\.project-details-page-ready \.project-details-tabs[\s\S]*?display: block !important;[\s\S]*?align-items: stretch !important;[\s\S]*?padding: 20px 12px 12px !important;/,
    );
  });
});
