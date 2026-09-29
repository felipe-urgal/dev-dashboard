import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const panel = readFileSync(
  resolve(repoRoot, 'apps/web/src/components/ProjectAgentPanel.vue'),
  'utf8',
);
const providers = readFileSync(
  resolve(repoRoot, 'packages/agent-runtime/src/providers.ts'),
  'utf8',
);
const contracts = readFileSync(
  resolve(repoRoot, 'packages/agent-runtime/src/contracts.ts'),
  'utf8',
);
const browserProvider = readFileSync(
  resolve(repoRoot, 'packages/agent-runtime/src/browser-provider.ts'),
  'utf8',
);

const diagnosticCodes = [
  'ready',
  'command-unavailable',
  'version-unsupported',
  'authentication-required',
  'preflight-timeout',
  'runtime-failed',
  'bridge-token-missing',
  'bridge-unavailable',
  'bridge-unhealthy',
  'bridge-paused',
  'browser-extension-unavailable',
  'browser-extension-stale',
  'browser-session-unavailable',
  'automatic-unavailable',
] as const;

describe('Agent provider doctor', () => {
  it('mantém todos os diagnósticos do contrato com resumo e próxima ação na UI', () => {
    for (const code of diagnosticCodes) {
      expect(contracts).toContain("'" + code + "'");
      expect(panel).toContain("case '" + code + "':");
    }

    expect(panel).toContain('data-testid="provider-diagnostic"');
    expect(panel).toContain('Evidência:');
    expect(panel).toContain('Próxima ação:');
  });

  it('permite revalidar providers na mesma tela sem reiniciar o Dashboard', () => {
    expect(panel).toContain('aria-label="Revalidar providers"');
    expect(panel).toContain('@click="refreshProviders"');
    expect(panel).toContain('providers.value = await fetchAgentProviders()');
  });

  it('distingue ausência, versão, autenticação e falha de runtime dos CLIs locais', () => {
    expect(providers).toContain("code: 'command-unavailable'");
    expect(providers).toContain("code: 'version-unsupported'");
    expect(providers).toContain("code: 'authentication-required'");
    expect(providers).toContain("code: 'runtime-failed'");
    expect(providers).toContain("['login', 'status']");
    expect(providers).toContain("['auth', 'status']");
  });

  it('distingue bridge, extensão e sessão no ChatGPT Browser', () => {
    for (const code of [
      'bridge-token-missing',
      'bridge-unavailable',
      'bridge-unhealthy',
      'bridge-paused',
      'browser-extension-unavailable',
      'browser-extension-stale',
      'browser-session-unavailable',
    ]) {
      expect(browserProvider).toContain("'" + code + "'");
    }
  });

  it('mantém setup guiado sem shell livre vindo da UI', () => {
    expect(panel).not.toMatch(
      /exec\\s*\\(|spawn\\s*\\(|child_process|shell\\s*:/,
    );
    expect(panel).toContain(
      'Autentique o provider pelo fluxo oficial local e revalide.',
    );
    expect(panel).toContain(
      'Ative/conecte a extensão ChatGPT Browser e revalide.',
    );
  });
});
