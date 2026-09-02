import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raizFonte = resolve(import.meta.dirname, '../src');
const raizDosEstilos = resolve(raizFonte, 'styles');
const lerEstilo = (arquivo: string) =>
  readFileSync(resolve(raizDosEstilos, arquivo), 'utf8');

const lerComponentes = () => {
  const arquivoPrincipal = lerEstilo('components.css');
  const importados = [
    ...arquivoPrincipal.matchAll(/@import\s+'\.\/(components\/[^']+)'/g),
  ].map((correspondencia) => lerEstilo(correspondencia[1] ?? ''));
  return [arquivoPrincipal, ...importados].join('\n');
};

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

  it('expõe tokens semânticos para interação, tipografia, código e motion', () => {
    const tokens = lerEstilo('tokens.css');
    const base = lerEstilo('base.css');
    const layout = lerEstilo('layout.css');
    const componentes = lerComponentes();
    const tokensSemanticos = [
      '--font-family-mono:',
      '--font-label:',
      '--font-control:',
      '--font-body:',
      '--control-height-sm:',
      '--control-height-md:',
      '--control-height-lg:',
      '--interactive-target-min:',
      '--disabled-opacity:',
      '--focus-ring-width:',
      '--focus-ring-color:',
      '--focus-ring-offset:',
      '--overlay-backdrop:',
      '--code-surface:',
      '--code-text:',
      '--diff-line-height:',
      '--motion-duration-fast:',
      '--motion-easing-standard:',
    ];

    for (const token of tokensSemanticos) {
      expect(tokens).toContain(token);
    }

    expect(tokens).toContain('--font-label: 11px;');
    expect(tokens).toContain('--font-control: 12px;');
    expect(tokens).toContain('--font-body: 13px;');
    expect(tokens).toContain('--font-xs: var(--font-label);');
    expect(tokens).toContain('--font-sm: var(--font-control);');
    expect(tokens).toContain('--font-md: var(--font-body);');
    expect(base).toContain('opacity: var(--disabled-opacity);');
    expect(base).toContain('font-family: var(--font-family-mono);');
    expect(layout).toContain('min-height: var(--control-height-sm);');
    expect(layout).toContain('min-height: var(--control-height-md);');
    expect(layout).toContain('width: var(--interactive-target-min);');
    expect(layout).toContain(
      'outline: var(--focus-ring-width) solid var(--focus-ring-color);',
    );
    expect(layout).toContain('var(--motion-duration-fast)');
    expect(componentes).toContain('background: var(--code-surface);');
    expect(componentes).toContain('color: var(--code-text);');
    expect(componentes).toContain('line-height: var(--diff-line-height);');
  });

  it('aplica fallback global quando reduced motion está ativo', () => {
    const base = lerEstilo('base.css');

    expect(base).toContain('@media (prefers-reduced-motion: reduce)');
    expect(base).toContain('scroll-behavior: auto !important;');
    expect(base).toContain('animation-duration: 0.01ms !important;');
    expect(base).toContain('animation-iteration-count: 1 !important;');
    expect(base).toContain('transition-duration: 0.01ms !important;');
  });

  it('mantém o shell e Processos acima da microtipografia legada', () => {
    const estilosAuditados = [
      lerEstilo('layout.css'),
      lerEstilo('components/processes.css'),
    ];

    for (const estilo of estilosAuditados) {
      expect(estilo).not.toMatch(/font-size:\s*(?:8|9|10)px/);
      expect(estilo).toContain('font-size: var(--font-label);');
      expect(estilo).toContain('font-size: var(--font-control);');
    }
  });

  it('mantém CSS global dentro da árvore src/styles', () => {
    const cssNoRaiz = readdirSync(raizFonte, { withFileTypes: true })
      .filter((entrada) => entrada.isFile() && entrada.name.endsWith('.css'))
      .map((entrada) => entrada.name)
      .sort();
    const bootstrap = readFileSync(resolve(raizFonte, 'main.ts'), 'utf8');
    const importsRelativosDeCss = [
      ...bootstrap.matchAll(/import\s+'(\.\/[^']+\.css)'/g),
    ].map((correspondencia) => correspondencia[1] ?? '');

    expect(cssNoRaiz).toEqual(['styles.css']);
    expect(importsRelativosDeCss[0]).toBe('./styles.css');
    expect(
      importsRelativosDeCss
        .slice(1)
        .every((caminho) => caminho.startsWith('./styles/features/')),
    ).toBe(true);
  });

  it('preserva seletores estruturais das rotas principais', () => {
    const layout = lerEstilo('layout.css');
    const componentes = lerComponentes();

    for (const seletor of ['.app-shell', '.sidebar', '.content']) {
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
    const componentes = lerComponentes();
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
