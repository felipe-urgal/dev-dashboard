import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  providerDiagnosticAction,
  providerDiagnosticSummary,
  providerFallbackDiagnostic,
  providerObservedAtLabel,
} from '../src/agent-provider-doctor';

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
      expect(providerDiagnosticSummary(code)).not.toBe(
        'Diagnóstico do provider indisponível.',
      );
      expect(providerDiagnosticAction(code)).not.toBe(
        'Revalide o provider após corrigir a configuração local.',
      );
    }

    expect(providerFallbackDiagnostic('codex').code).toBe(
      'command-unavailable',
    );
    expect(providerFallbackDiagnostic('claude-code').code).toBe(
      'command-unavailable',
    );
    expect(providerFallbackDiagnostic('chatgpt-browser').code).toBe(
      'bridge-unavailable',
    );
    expect(providerFallbackDiagnostic('automatic').code).toBe(
      'automatic-unavailable',
    );

    expect(panel).toContain('data-testid="provider-doctor"');
    expect(panel).toContain('data-testid="provider-diagnostic"');
    expect(panel).toContain('v-for="provider in providerOptions"');
    expect(panel).toContain('Evidência:');
    expect(panel).toContain('Próxima ação:');
  });

  it('expõe freshness da última validação do provider', () => {
    expect(providerObservedAtLabel('')).toBe('Ainda não validado');
    expect(providerObservedAtLabel('valor-inválido')).toBe(
      'Horário de validação indisponível',
    );
    expect(providerObservedAtLabel('2026-09-29T19:30:00.000Z')).toContain(
      'Validado em',
    );
    expect(panel).toContain('providerObservedAtLabel(provider.observedAt)');
  });

  it('permite revalidar providers na mesma tela sem reiniciar o Dashboard', () => {
    expect(panel).toContain('Revalidar conexão');
    expect(panel).toContain('@click="refreshProviders"');
    expect(panel).toContain('providers.value = await fetchAgentProviders()');
  });

  it('distingue ausência, versão, autenticação e falha de runtime dos CLIs locais', () => {
    expect(providers).toContain("code: 'command-unavailable'");
    expect(providers).toContain("'version-unsupported'");
    expect(providers).toContain("'authentication-required'");
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
    const template = panel.slice(
      panel.indexOf('<template>'),
      panel.indexOf('<style scoped>'),
    );
    expect(template).not.toMatch(/spawn\s*\(|child_process|shell\s*:/);
    expect(providerDiagnosticAction('authentication-required')).toBe(
      'Autentique o provider pelo fluxo oficial local e revalide.',
    );
    expect(providerDiagnosticAction('browser-extension-unavailable')).toBe(
      'Ative/conecte a extensão ChatGPT Browser e revalide.',
    );
  });
});
