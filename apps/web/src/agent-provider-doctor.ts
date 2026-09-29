import type {
  AgentProviderDiagnosticCode,
  AgentProviderId,
} from './api/agent-runtime';

export function providerFallbackDiagnostic(providerId: AgentProviderId): {
  code: AgentProviderDiagnosticCode;
  evidence: string;
} {
  return {
    code:
      providerId === 'automatic'
        ? 'automatic-unavailable'
        : providerId === 'chatgpt-browser'
          ? 'bridge-unavailable'
          : 'command-unavailable',
    evidence: 'Provider não configurado neste runtime.',
  };
}

export function providerDiagnosticSummary(
  code: AgentProviderDiagnosticCode | undefined,
): string {
  switch (code) {
    case 'ready':
      return 'Provider pronto para execução.';
    case 'command-unavailable':
      return 'CLI ou componente local não foi encontrado.';
    case 'version-unsupported':
      return 'Versão instalada não é suportada.';
    case 'authentication-required':
      return 'Autenticação não foi confirmada.';
    case 'preflight-timeout':
      return 'Validação do provider excedeu o tempo limite.';
    case 'runtime-failed':
      return 'O provider respondeu, mas o preflight falhou.';
    case 'bridge-token-missing':
      return 'Credencial local do Browser Bridge não está disponível.';
    case 'bridge-unavailable':
      return 'Browser Bridge não está acessível.';
    case 'bridge-unhealthy':
      return 'Browser Bridge respondeu com estado não saudável.';
    case 'bridge-paused':
      return 'Browser Bridge está pausado.';
    case 'browser-extension-unavailable':
      return 'Extensão ChatGPT Browser não está conectada.';
    case 'browser-extension-stale':
      return 'Heartbeat da extensão ChatGPT Browser está desatualizado.';
    case 'browser-session-unavailable':
      return 'Sessão do ChatGPT não está disponível na extensão.';
    case 'automatic-unavailable':
      return 'Automatic não encontrou Codex ou Claude Code pronto.';
    default:
      return 'Diagnóstico do provider indisponível.';
  }
}

export function providerDiagnosticAction(
  code: AgentProviderDiagnosticCode | undefined,
): string {
  switch (code) {
    case 'ready':
      return 'Nenhuma ação necessária.';
    case 'command-unavailable':
      return 'Instale o CLI/componente oficial e revalide.';
    case 'version-unsupported':
      return 'Atualize o provider para uma versão suportada e revalide.';
    case 'authentication-required':
      return 'Autentique o provider pelo fluxo oficial local e revalide.';
    case 'preflight-timeout':
      return 'Verifique se o provider responde localmente e revalide.';
    case 'runtime-failed':
      return 'Execute o diagnóstico oficial do provider localmente e revalide.';
    case 'bridge-token-missing':
      return 'Reconfigure o setup local do Browser Bridge e revalide.';
    case 'bridge-unavailable':
      return 'Inicie o Browser Bridge local e revalide.';
    case 'bridge-unhealthy':
      return 'Corrija o estado do Browser Bridge e revalide.';
    case 'bridge-paused':
      return 'Retome o Browser Bridge e revalide.';
    case 'browser-extension-unavailable':
      return 'Ative/conecte a extensão ChatGPT Browser e revalide.';
    case 'browser-extension-stale':
      return 'Reconecte ou recarregue a extensão e revalide.';
    case 'browser-session-unavailable':
      return 'Abra uma sessão autenticada do ChatGPT e revalide.';
    case 'automatic-unavailable':
      return 'Configure Codex ou Claude Code e revalide.';
    default:
      return 'Revalide o provider após corrigir a configuração local.';
  }
}

export function providerObservedAtLabel(observedAt: string): string {
  if (!observedAt) return 'Ainda não validado';
  const value = new Date(observedAt);
  if (Number.isNaN(value.getTime())) return 'Horário de validação indisponível';
  return 'Validado em ' + value.toLocaleString();
}
