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
