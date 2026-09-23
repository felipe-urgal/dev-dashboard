import type { AgentConcreteProviderId } from './contracts.js';

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
