import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const routerSource = readFileSync(
  resolve(webRoot, 'src/router/index.ts'),
  'utf8',
);
const appSource = readFileSync(resolve(webRoot, 'src/App.vue'), 'utf8');
const viewSource = readFileSync(
  resolve(webRoot, 'src/views/StacksView.vue'),
  'utf8',
);
const apiSource = readFileSync(resolve(webRoot, 'src/api/stacks.ts'), 'utf8');
const paletteSource = readFileSync(
  resolve(webRoot, 'src/command-palette-navigation.ts'),
  'utf8',
);

describe('Stacks multi-projeto', () => {
  it('expõe Stacks como página global', () => {
    expect(routerSource).toMatch(
      /path: '\/stacks'[\s\S]*?name: 'stacks'[\s\S]*?StacksView\.vue/,
    );
    expect(appSource).toContain('<span class="navigation-text">Stacks</span>');
    expect(paletteSource).toContain("id: 'page-stacks'");
    expect(paletteSource).toContain("to: { name: 'stacks' }");
  });

  it('usa somente a API estruturada de Stacks', () => {
    expect(apiSource).toContain("'/api/stacks'");
    expect(apiSource).toContain("'/check'");
    expect(apiSource).toContain("'/start'");
    expect(apiSource).toContain("'/stop'");
    expect(apiSource).toContain('/restart');
    expect(apiSource).not.toContain('path');
    expect(apiSource).not.toContain('argv');
    expect(apiSource).not.toContain('command');
  });

  it('navega para o domínio responsável sem inferir process kind', () => {
    expect(viewSource).toContain("name: 'project-compose'");
    expect(viewSource).toContain("name: 'project-server'");
    expect(viewSource).toContain("name: 'project-details'");
    expect(viewSource).toContain('environmentInstanceId');
    expect(viewSource).toContain('Abrir Compose');
    expect(viewSource).toContain('Abrir servidor');
    expect(viewSource).toContain('Abrir projeto');
    expect(viewSource).not.toContain('processId.includes');
    expect(viewSource).not.toContain('processId.startsWith');
  });

  it('mostra topologia, estado e lifecycle suportado sem inventar mutações', () => {
    expect(viewSource).toContain('Ordem topológica');
    expect(viewSource).toContain("target.kind === 'compose-service'");
    expect(viewSource).toContain('Iniciar');
    expect(viewSource).toContain('Parar');
    expect(viewSource).toContain('Reiniciar');
    expect(viewSource).toContain('canRestart(node)');
    expect(viewSource).not.toContain('Criar Stack');
    expect(viewSource).not.toContain('Editar Stack');
    expect(viewSource).not.toContain('Excluir Stack');
  });
});
