import type { AgentConcreteProviderId } from './contracts.js';
import {
  AgentCliProcessError,
  runAgentCliProcess,
  type AgentCliProcessRunner,
} from './cli-process.js';

export type AgentIntegrationKind =
  'mcp-server' | 'skill' | 'plugin' | 'browser-capability';

export type AgentIntegrationScope = 'user' | 'project' | 'local' | 'session';

export type AgentIntegrationOperation =
  | 'list'
  | 'inspect'
  | 'install'
  | 'enable'
  | 'disable'
  | 'uninstall'
  | 'authenticate';

export interface AgentIntegration {
  id: string;
  providerId: AgentConcreteProviderId;
  kind: AgentIntegrationKind;
  name: string;
  enabled?: boolean;
  authStatus?: 'authenticated' | 'unauthenticated' | 'unsupported' | 'unknown';
}

export interface AgentIntegrationListRequest {
  cwd: string;
}

export interface AgentIntegrationInstallRequest {
  cwd: string;
  kind: AgentIntegrationKind;
  name: string;
  scope: AgentIntegrationScope;
  confirmed: boolean;
  url?: string;
}

export interface AgentIntegrationProvider {
  readonly id: AgentConcreteProviderId;
  list(request: AgentIntegrationListRequest): Promise<AgentIntegration[]>;
  install?(request: AgentIntegrationInstallRequest): Promise<AgentIntegration>;
}

export interface AgentIntegrationProviderRegistry {
  get(providerId: AgentConcreteProviderId): AgentIntegrationProvider | null;
  list(): AgentIntegrationProvider[];
}

export class AgentIntegrationDiscoveryError extends Error {
  constructor(
    readonly code:
      | 'provider-unavailable'
      | 'command-failed'
      | 'invalid-request'
      | 'invalid-response',
    message: string,
  ) {
    super(message);
    this.name = 'AgentIntegrationDiscoveryError';
  }
}

export class StaticAgentIntegrationProviderRegistry implements AgentIntegrationProviderRegistry {
  private readonly providers = new Map<
    AgentConcreteProviderId,
    AgentIntegrationProvider
  >();

  constructor(providers: readonly AgentIntegrationProvider[]) {
    for (const provider of providers) {
      if (this.providers.has(provider.id)) {
        throw new Error('duplicate integration provider: ' + provider.id);
      }
      this.providers.set(provider.id, provider);
    }
  }

  get(providerId: AgentConcreteProviderId): AgentIntegrationProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  list(): AgentIntegrationProvider[] {
    return [...this.providers.values()];
  }
}

interface CodexMcpIntegrationProviderOptions {
  command?: string;
  runProcess?: AgentCliProcessRunner;
  timeoutMs?: number;
}

function normalizeAuthStatus(
  value: unknown,
): AgentIntegration['authStatus'] | undefined {
  if (typeof value !== 'string') return undefined;
  if (
    value === 'authenticated' ||
    value === 'unauthenticated' ||
    value === 'unsupported'
  ) {
    return value;
  }
  return 'unknown';
}

export class CodexMcpIntegrationProvider implements AgentIntegrationProvider {
  readonly id = 'codex' as const;
  private readonly command: string;
  private readonly runProcess: AgentCliProcessRunner;
  private readonly timeoutMs: number;

  constructor(options: CodexMcpIntegrationProviderOptions = {}) {
    this.command = options.command ?? 'codex';
    this.runProcess = options.runProcess ?? runAgentCliProcess;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async list(
    request: AgentIntegrationListRequest,
  ): Promise<AgentIntegration[]> {
    let result;
    try {
      result = await this.runProcess({
        command: this.command,
        args: ['mcp', 'list', '--json'],
        cwd: request.cwd,
        timeoutMs: this.timeoutMs,
        label: 'Codex MCP discovery',
      });
    } catch (error) {
      if (
        error instanceof AgentCliProcessError &&
        error.code === 'spawn-failed'
      ) {
        throw new AgentIntegrationDiscoveryError(
          'provider-unavailable',
          'Codex command is unavailable.',
        );
      }
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Codex MCP discovery failed.',
      );
    }

    if (result.signal !== null || result.exitCode !== 0) {
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Codex MCP discovery returned a non-zero result.',
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Codex MCP discovery returned invalid JSON.',
      );
    }

    if (!Array.isArray(payload)) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Codex MCP discovery returned an unexpected payload.',
      );
    }

    return payload.map((entry, index) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof (entry as { name?: unknown }).name !== 'string' ||
        !(entry as { name: string }).name.trim()
      ) {
        throw new AgentIntegrationDiscoveryError(
          'invalid-response',
          'Codex MCP discovery returned an invalid server at index ' +
            index +
            '.',
        );
      }

      const item = entry as {
        name: string;
        enabled?: unknown;
        auth_status?: unknown;
      };
      const name = item.name.trim();
      const authStatus = normalizeAuthStatus(item.auth_status);

      return {
        id: 'codex:mcp-server:' + name,
        providerId: 'codex',
        kind: 'mcp-server',
        name,
        ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
        ...(authStatus ? { authStatus } : {}),
      };
    });
  }

  async install(
    request: AgentIntegrationInstallRequest,
  ): Promise<AgentIntegration> {
    if (!request.confirmed) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP installation requires explicit confirmation.',
      );
    }
    if (request.kind !== 'mcp-server') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex only supports MCP installation through this adapter.',
      );
    }
    if (request.scope !== 'user') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP installation currently supports only explicit user scope.',
      );
    }

    const name = request.name.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP server name is invalid.',
      );
    }

    let url: URL;
    try {
      url = new URL(request.url ?? '');
    } catch {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP server URL is invalid.',
      );
    }
    if (url.protocol !== 'https:') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP server URL must use HTTPS.',
      );
    }

    let result;
    try {
      result = await this.runProcess({
        command: this.command,
        args: ['mcp', 'add', name, '--url', url.toString()],
        cwd: request.cwd,
        timeoutMs: this.timeoutMs,
        label: 'Codex MCP installation',
      });
    } catch (error) {
      if (
        error instanceof AgentCliProcessError &&
        error.code === 'spawn-failed'
      ) {
        throw new AgentIntegrationDiscoveryError(
          'provider-unavailable',
          'Codex command is unavailable.',
        );
      }
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Codex MCP installation failed.',
      );
    }

    if (result.signal !== null || result.exitCode !== 0) {
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Codex MCP installation returned a non-zero result.',
      );
    }

    return {
      id: 'codex:mcp-server:' + name,
      providerId: 'codex',
      kind: 'mcp-server',
      name,
      enabled: true,
      authStatus: 'unknown',
    };
  }
}

export function createDefaultAgentIntegrationProviderRegistry(): AgentIntegrationProviderRegistry {
  return new StaticAgentIntegrationProviderRegistry([
    new CodexMcpIntegrationProvider(),
  ]);
}

export interface AgentIntegrationCapability {
  kind: AgentIntegrationKind;
  scopes: readonly AgentIntegrationScope[];
  operations: readonly AgentIntegrationOperation[];
  availability: 'supported' | 'unavailable';
  reason?: string;
}

export interface AgentIntegrationProviderCapabilities {
  providerId: AgentConcreteProviderId;
  integrations: readonly AgentIntegrationCapability[];
}

export interface AgentIntegrationCapabilityRegistry {
  get(
    providerId: AgentConcreteProviderId,
  ): AgentIntegrationProviderCapabilities | null;
  list(): AgentIntegrationProviderCapabilities[];
}

function freezeCapabilities(
  providerId: AgentConcreteProviderId,
  integrations: readonly AgentIntegrationCapability[],
): AgentIntegrationProviderCapabilities {
  return Object.freeze({
    providerId,
    integrations: Object.freeze(
      integrations.map((integration) =>
        Object.freeze({
          ...integration,
          scopes: Object.freeze([...integration.scopes]),
          operations: Object.freeze([...integration.operations]),
        }),
      ),
    ),
  });
}

export class StaticAgentIntegrationCapabilityRegistry implements AgentIntegrationCapabilityRegistry {
  private readonly providers = new Map<
    AgentConcreteProviderId,
    AgentIntegrationProviderCapabilities
  >();

  constructor(capabilities: readonly AgentIntegrationProviderCapabilities[]) {
    for (const capability of capabilities) {
      if (this.providers.has(capability.providerId)) {
        throw new Error(
          'duplicate integration capability provider: ' + capability.providerId,
        );
      }

      this.providers.set(
        capability.providerId,
        freezeCapabilities(capability.providerId, capability.integrations),
      );
    }
  }

  get(
    providerId: AgentConcreteProviderId,
  ): AgentIntegrationProviderCapabilities | null {
    return this.providers.get(providerId) ?? null;
  }

  list(): AgentIntegrationProviderCapabilities[] {
    return [...this.providers.values()];
  }
}

export function createDefaultAgentIntegrationCapabilityRegistry(): AgentIntegrationCapabilityRegistry {
  return new StaticAgentIntegrationCapabilityRegistry([
    {
      providerId: 'codex',
      integrations: [
        {
          kind: 'mcp-server',
          scopes: ['user', 'project'],
          operations: [
            'list',
            'inspect',
            'install',
            'enable',
            'disable',
            'uninstall',
            'authenticate',
          ],
          availability: 'supported',
        },
        {
          kind: 'skill',
          scopes: ['user', 'project'],
          operations: [],
          availability: 'unavailable',
          reason:
            'Codex skills are not managed until a stable machine-readable CLI surface is wired.',
        },
        {
          kind: 'plugin',
          scopes: ['user', 'project'],
          operations: [],
          availability: 'unavailable',
          reason:
            'Codex plugins are not managed until a stable machine-readable CLI surface is wired.',
        },
      ],
    },
    {
      providerId: 'claude-code',
      integrations: [
        {
          kind: 'mcp-server',
          scopes: ['user', 'project', 'local'],
          operations: [
            'list',
            'inspect',
            'install',
            'enable',
            'disable',
            'uninstall',
            'authenticate',
          ],
          availability: 'supported',
        },
        {
          kind: 'skill',
          scopes: ['user', 'project'],
          operations: ['list', 'inspect'],
          availability: 'supported',
        },
        {
          kind: 'plugin',
          scopes: ['user', 'project', 'local'],
          operations: [
            'list',
            'inspect',
            'install',
            'enable',
            'disable',
            'uninstall',
          ],
          availability: 'supported',
        },
      ],
    },
    {
      providerId: 'chatgpt-browser',
      integrations: [
        {
          kind: 'browser-capability',
          scopes: ['session'],
          operations: ['list', 'inspect'],
          availability: 'supported',
        },
        {
          kind: 'mcp-server',
          scopes: ['session'],
          operations: [],
          availability: 'unavailable',
          reason:
            'ChatGPT account integrations remain outside the local Browser provider boundary.',
        },
        {
          kind: 'plugin',
          scopes: ['session'],
          operations: [],
          availability: 'unavailable',
          reason:
            'ChatGPT account plugin installation is not managed by the local Browser provider.',
        },
      ],
    },
  ]);
}
