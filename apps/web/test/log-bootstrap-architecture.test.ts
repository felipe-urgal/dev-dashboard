import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raizWeb = resolve(import.meta.dirname, '..');
const entrada = readFileSync(resolve(raizWeb, 'src/main.ts'), 'utf8');

describe('arquitetura do bootstrap de logs', () => {
  it('não reinstala o Log Visual Enhancer baseado em MutationObserver', () => {
    expect(entrada).not.toContain('installLogVisualEnhancer');
    expect(entrada).not.toContain("from './log-visual-enhancer'");
    expect(existsSync(resolve(raizWeb, 'src/log-visual-enhancer.ts'))).toBe(
      false,
    );
    expect(existsSync(resolve(raizWeb, 'src/log-visual'))).toBe(false);
  });

  it('não mantém o Log Detail Enhancer nem a superfície DOM antiga', () => {
    expect(entrada).not.toContain('installLogDetailEnhancer');
    expect(entrada).not.toContain("from './log-detail-enhancer'");
    expect(entrada).not.toContain("import './log-detail-enhancer.css'");
    expect(entrada).not.toContain("import './log-visual-enhancer.css'");
    expect(entrada).not.toContain("import './log-stream-syntax.css'");
    expect(existsSync(resolve(raizWeb, 'src/log-detail-enhancer.ts'))).toBe(
      false,
    );
    expect(existsSync(resolve(raizWeb, 'src/log-detail-enhancer.css'))).toBe(
      false,
    );
    expect(existsSync(resolve(raizWeb, 'src/log-detail'))).toBe(false);
    expect(existsSync(resolve(raizWeb, 'src/log-visual-enhancer.css'))).toBe(
      false,
    );
    expect(existsSync(resolve(raizWeb, 'src/log-stream-syntax.css'))).toBe(
      false,
    );
  });

  it('mantém o log do servidor como componente Vue sem decoração global', () => {
    const serverTemplate = readFileSync(
      resolve(raizWeb, 'src/components/ProjectServerPanel.template.html'),
      'utf8',
    );
    const terminal = readFileSync(
      resolve(raizWeb, 'src/components/ProjectLogTerminal.vue'),
      'utf8',
    );

    expect(serverTemplate).toContain('<ProjectLogTerminal');
    expect(serverTemplate).not.toContain('project-log-raw-lines');
    expect(terminal).toContain("import { Terminal } from '@xterm/xterm'");
    expect(terminal).toContain('watch(() => props.content, renderContent)');
  });

  it('mantém classificação e apresentação visual no fluxo declarativo Vue', () => {
    const experience = readFileSync(
      resolve(raizWeb, 'src/components/ProjectLogExperience.vue'),
      'utf8',
    );
    const flow = readFileSync(
      resolve(raizWeb, 'src/components/LogExperienceFlow.vue'),
      'utf8',
    );
    const parser = readFileSync(
      resolve(raizWeb, 'src/utils/log-experience.ts'),
      'utf8',
    );

    expect(experience).toContain('parseLogExperience');
    expect(flow).toContain('toneClass(line.tone)');
    expect(flow).toContain('props.searchQuery');
    expect(parser).toContain('toneAndIssueForLine');
  });
});
