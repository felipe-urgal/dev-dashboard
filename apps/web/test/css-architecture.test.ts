import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raizDosEstilos = resolve(import.meta.dirname, '../src/styles');
const lerEstilo = (arquivo: string) =>
  readFileSync(resolve(raizDosEstilos, arquivo), 'utf8');

describe('arquitetura de CSS', () => {
  it('mantém o ponto de entrada pequeno e a ordem explícita das camadas', () => {
    const entradaCompativel = readFileSync(
      resolve(raizDosEstilos, '../styles.css'),
      'utf8',
    );
    const entrada = lerEstilo('index.css');

    expect(entradaCompativel.split('\n').length).toBeLessThanOrEqual(100);
    expect(entradaCompativel).toContain("@import './styles/index.css'");
    expect(entrada.match(/@import/g)).toHaveLength(5);
    expect(entrada).toMatch(
      /tokens\.css[\s\S]*base\.css[\s\S]*layout\.css[\s\S]*components\.css[\s\S]*utilities\.css/,
    );
  });

  it('preserva seletores estruturais das rotas principais', () => {
    const layout = lerEstilo('layout.css');
    const componentes = lerEstilo('components.css');

    for (const seletor of ['.app-shell', '.sidebar', '.topbar', '.content']) {
      expect(layout).toContain(`${seletor} {`);
    }

    for (const seletor of [
      '.projects-list',
      '.project-details-grid',
      '.activity-list',
      '.git-diff-layout',
    ]) {
      expect(componentes).toContain(`${seletor} {`);
    }
  });

  it('não reintroduz famílias visuais legadas nem cores fora dos tokens', () => {
    const componentes = lerEstilo('components.css');
    const familiasRemovidas = [
      'activity-status-',
      'git-status-',
      'script-risk-',
      'database-status-',
    ];

    for (const familia of familiasRemovidas) {
      expect(componentes).not.toContain(familia);
    }

    expect(componentes).not.toMatch(/#[\da-f]{3,8}\b/i);
    expect(lerEstilo('layout.css')).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
});
