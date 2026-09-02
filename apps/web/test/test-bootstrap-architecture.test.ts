import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raizWeb = resolve(import.meta.dirname, '..');
const entrada = readFileSync(resolve(raizWeb, 'src/main.ts'), 'utf8');

describe('arquitetura do bootstrap de testes', () => {
  it('não reinstala o Test Tone baseado em MutationObserver', () => {
    expect(entrada).not.toContain('installTestLogToneEnhancer');
    expect(entrada).not.toContain("from './test-log-tone-enhancer'");
    expect(entrada).not.toContain("import './test-log-visual-polish.css'");
    expect(existsSync(resolve(raizWeb, 'src/test-log-tone-enhancer.ts'))).toBe(
      false,
    );
    expect(existsSync(resolve(raizWeb, 'src/test-log-tone'))).toBe(false);
    expect(existsSync(resolve(raizWeb, 'src/test-log-visual-polish.css'))).toBe(
      false,
    );
  });

  it('não reinstala o Test Inspector baseado em MutationObserver', () => {
    expect(entrada).not.toContain('installTestLogInspector');
    expect(entrada).not.toContain('installTestLogInspectorMutationGuard');
    expect(entrada).not.toContain("from './test-log-inspector'");
    expect(entrada).not.toContain("import './test-log-inspector.css'");
    expect(existsSync(resolve(raizWeb, 'src/test-log-inspector.ts'))).toBe(false);
    expect(existsSync(resolve(raizWeb, 'src/test-log-inspector'))).toBe(false);
    expect(
      existsSync(resolve(raizWeb, 'src/test-log-inspector-mutation-guard.ts')),
    ).toBe(false);
    expect(existsSync(resolve(raizWeb, 'src/test-log-inspector.css'))).toBe(
      false,
    );
  });

  it('mantém a execução atual de testes em Vue e xterm', () => {
    const panel = readFileSync(
      resolve(raizWeb, 'src/components/ProjectTestsPtyPanel.vue'),
      'utf8',
    );

    expect(panel).toContain('usePtyTerminalSocket');
    expect(panel).toContain('class="tests-pty-terminal"');
    expect(panel).not.toContain('tests-log-shell');
  });
});
