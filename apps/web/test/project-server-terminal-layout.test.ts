import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const serverCss = readFileSync(
  resolve(webRoot, 'src/components/ProjectServerPanel.css'),
  'utf8',
);
const terminalSource = readFileSync(
  resolve(webRoot, 'src/components/ProjectTerminalPanel.vue'),
  'utf8',
);
const detailsSource = readFileSync(
  resolve(webRoot, 'src/views/ProjectDetailsView.vue'),
  'utf8',
);

describe('redesign de Servidor e Terminal', () => {
  it('usa o servidor como workspace contínuo com console flexível', () => {
    expect(serverCss).toMatch(
      /\.server-dashboard[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/,
    );
    expect(serverCss).toMatch(
      /\.server-console-card[\s\S]*?flex: 1 1 0;[\s\S]*?border-radius: 0;/,
    );
    expect(detailsSource).toMatch(
      /'project-details-page-pty':[\s\S]*?isServerRoute \|\|/,
    );
  });

  it('remove o card e o resize local do terminal para preencher o shell', () => {
    expect(terminalSource).not.toContain("import Card from './Card.vue'");
    expect(terminalSource).not.toContain('resize: both');
    expect(terminalSource).toMatch(
      /\.terminal-window[\s\S]*?width: 100%;[\s\S]*?height: 100%;/,
    );
    expect(terminalSource).toContain('class="terminal-state"');
  });
});
