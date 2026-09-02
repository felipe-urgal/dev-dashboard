import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raizWeb = resolve(import.meta.dirname, '..');
const raizFonte = resolve(raizWeb, 'src');
const entrada = readFileSync(resolve(raizFonte, 'main.ts'), 'utf8');

function listarFontes(diretorio: string): string[] {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = resolve(diretorio, entrada.name);
    if (entrada.isDirectory()) return listarFontes(caminho);
    return /\.(?:ts|vue)$/.test(entrada.name) ? [caminho] : [];
  });
}

const seletorLegado =
  /(?:tests-log-(?:shell|output|lines|footer|tabs)|project-log-raw-lines|test-log-(?:inspector|explorer-toolbar|failed-examples|run-context|visual-))/;
const engineGlobalDeDom =
  /\bMutationObserver\b|document\.(?:documentElement|querySelector|querySelectorAll)/;

describe('guard arquitetural de Logs e Testes declarativos', () => {
  it('mantém Logs/Testes fora do bootstrap global', () => {
    expect(entrada).not.toMatch(
      /import\s+(?:[^;]+?\s+from\s+)?['"][^'"]*(?:log|test)[^'"]*['"]/i,
    );
    expect(entrada).not.toMatch(
      /\b(?:install|enhance)(?:Log|Test)[A-Za-z0-9_]*\s*\(/,
    );
    expect(entrada).not.toMatch(
      /\bMutationObserver\b|document\.(?:documentElement|querySelector|querySelectorAll)/,
    );
  });

  it('impede reintroduzir pós-processamento global sobre superfícies legadas', () => {
    const violacoes = listarFontes(raizFonte)
      .filter((arquivo) => arquivo !== resolve(raizFonte, 'main.ts'))
      .flatMap((arquivo) => {
        const fonte = readFileSync(arquivo, 'utf8');
        if (!seletorLegado.test(fonte) || !engineGlobalDeDom.test(fonte)) return [];
        return [relative(raizWeb, arquivo)];
      });

    expect(violacoes).toEqual([]);
  });
});
