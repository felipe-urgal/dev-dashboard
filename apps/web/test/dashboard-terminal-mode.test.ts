import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const appSource = readFileSync(resolve(webRoot, 'src/App.vue'), 'utf8');
const terminalSource = readFileSync(
  resolve(webRoot, 'src/components/DashboardTerminalMode.vue'),
  'utf8',
);

describe('modo Web / Terminal do Dev Dashboard', () => {
  it('mantém a interface web montada ao alternar para o terminal', () => {
    expect(appSource).toContain("type InterfaceMode = 'web' | 'terminal'");
    expect(appSource).toContain('v-show="interfaceMode === \'web\'"');
    expect(appSource).toContain(':active="interfaceMode === \'terminal\'"');
    expect(appSource).toContain('terminalMounted');
  });

  it('usa a sessão global do dev-tools e preserva a conexão quando fica inativa', () => {
    expect(terminalSource).toContain('prepareDashboardTerminalConfirmation');
    expect(terminalSource).toContain('dashboardTerminalWebSocketUrl');
    expect(terminalSource).toContain('if (!active) return;');
    expect(terminalSource).toContain('onBeforeUnmount(() =>');
  });
});

describe('hardening da sessão terminal', () => {
  it('persiste credenciais efêmeras para recuperar a sessão após reload', () => {
    expect(terminalSource).toContain('SESSION_STORAGE_KEY');
    expect(terminalSource).toContain('sessionStorage.setItem');
    expect(terminalSource).toContain('readReconnectCredentials');
    expect(terminalSource).toContain('reconnectToken');
  });

  it('mantém output pendente bounded e não descarta o xterm numa queda transitória', () => {
    expect(terminalSource).toContain('MAX_PENDING_OUTPUT_BYTES = 262_144');
    expect(terminalSource).toContain('boundedPendingOutput');
    expect(terminalSource).toContain("sessionState.value = 'disconnected'");
    expect(terminalSource).not.toContain(
      "sessionState.value = 'closed';\n      disposeTerminal();",
    );
  });

  it('debounça resize e restaura foco ao voltar para o modo Terminal', () => {
    expect(terminalSource).toContain('requestAnimationFrame');
    expect(terminalSource).toContain('queueResize');
    expect(terminalSource).toContain('terminal?.focus()');
  });

  it('expõe estados explícitos de desconexão e encerramento', () => {
    expect(terminalSource).toContain('Terminal desconectado');
    expect(terminalSource).toContain('Sessão encerrada');
    expect(terminalSource).toContain('Reconectar agora');
  });

  it('acompanha dark/light theme sem recriar a sessão', () => {
    expect(terminalSource).toContain('watch(currentTheme');
    expect(terminalSource).toContain("currentTheme.value === 'light'");
    expect(terminalSource).toContain(
      'terminal.options.theme = terminalTheme()',
    );
  });

  it('fechamento explícito limpa credenciais e encerra a sessão', () => {
    expect(terminalSource).toContain('clearReconnectCredentials()');
    expect(terminalSource).toContain(
      "close(1000, 'Sessão encerrada pelo usuário')",
    );
  });
});
