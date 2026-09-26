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
