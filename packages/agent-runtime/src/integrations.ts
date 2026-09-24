import type { AgentConcreteProviderId } from './contracts.js';
import { BROWSER_TOOL_NAMES } from './browser-tool-policy.js';
import {
  AgentCliProcessError,
  runAgentCliProcess,
  type AgentCliProcessRunner,
} from './cli-process.js';

export type AgentIntegrationKind =
  | 'mcp-server'
  | 'skill'
  | 'plugin'
  | 'marketplace'
  | 'browser-capability';

export type AgentIntegrationScope =
  'user' | 'project' | 'local' | 'managed' | 'session';

export type AgentIntegrationOrigin =
  | 'codex-global-config'
  | 'claude-plugin-inventory'
  | 'claude-marketplace-inventory'
  | 'browser-local-allowlist';

export type AgentIntegrationMarketplaceSource =
  | 'github'
  | 'git'
  | 'url'
  | 'local'
  | 'claude-ai'
  | 'unknown';

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
  scope?: AgentIntegrationScope;
  origin?: AgentIntegrationOrigin;
  version?: string;
  marketplace?: string;
  marketplaceSource?: AgentIntegrationMarketplaceSource;
  enabled?: boolean;
  authStatus?: 'authenticated' | 'unauthenticated' | 'unsupported' | 'unknown';
}

export interface AgentIntegrationDetails extends AgentIntegration {
  transportType?: 'stdio' | 'streamable-http';
  enabledTools?: string[];
  disabledTools?: string[];
  startupTimeoutSec?: number;
  toolTimeoutSec?: number;
}

export interface AgentIntegrationListRequest {
  cwd: string;
}

export interface AgentIntegrationIssue {
  code: 'invalid-entry' | 'source-unavailable';
  message: string;
  index?: number;
  source?: AgentIntegrationKind;
}

export interface AgentIntegrationListResult {
  integrations: AgentIntegration[];
  issues: AgentIntegrationIssue[];
}

export interface AgentIntegrationInspectRequest {
  cwd: string;
  kind: AgentIntegrationKind;
  name: string;
}

export interface AgentIntegrationInstallRequest {
  cwd: string;
  kind: AgentIntegrationKind;
  name: string;
  scope: AgentIntegrationScope;
  confirmed: boolean;
  url?: string;
}

export interface AgentIntegrationSetEnabledRequest {
  cwd: string;
  kind: AgentIntegrationKind;
  name: string;
  marketplace?: string;
  scope: AgentIntegrationScope;
  enabled: boolean;
}

export interface AgentIntegrationUninstallRequest {
  cwd: string;
  kind: AgentIntegrationKind;
  name: string;
  marketplace?: string;
  scope: AgentIntegrationScope;
  confirmed: boolean;
}

export interface AgentIntegrationUninstallResult {
  providerId: AgentConcreteProviderId;
  kind: AgentIntegrationKind;
  name: string;
  scope: AgentIntegrationScope;
  marketplace?: string;
  dataPreserved: boolean;
}

export interface AgentIntegrationProvider {
  readonly id: AgentConcreteProviderId;
  list(
    request: AgentIntegrationListRequest,
  ): Promise<AgentIntegrationListResult>;
  inspect?(
    request: AgentIntegrationInspectRequest,
  ): Promise<AgentIntegrationDetails>;
  install?(request: AgentIntegrationInstallRequest): Promise<AgentIntegration>;
  setEnabled?(
    request: AgentIntegrationSetEnabledRequest,
  ): Promise<AgentIntegration>;
  uninstall?(
    request: AgentIntegrationUninstallRequest,
  ): Promise<AgentIntegrationUninstallResult>;
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
  ): Promise<AgentIntegrationListResult> {
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

    const integrations: AgentIntegration[] = [];
    const issues: AgentIntegrationIssue[] = [];

    for (const [index, entry] of payload.entries()) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof (entry as { name?: unknown }).name !== 'string' ||
        !(entry as { name: string }).name.trim()
      ) {
        issues.push({
          code: 'invalid-entry',
          index,
          message: 'Codex MCP discovery ignored an invalid server entry.',
        });
        continue;
      }

      const item = entry as {
        name: string;
        enabled?: unknown;
        auth_status?: unknown;
      };
      const name = item.name.trim();
      const authStatus = normalizeAuthStatus(item.auth_status);

      integrations.push({
        id: 'codex:mcp-server:' + name,
        providerId: 'codex',
        kind: 'mcp-server',
        name,
        ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
        ...(authStatus ? { authStatus } : {}),
      });
    }

    return { integrations, issues };
  }

  async inspect(
    request: AgentIntegrationInspectRequest,
  ): Promise<AgentIntegrationDetails> {
    if (request.kind !== 'mcp-server') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex only supports MCP inspection through this adapter.',
      );
    }

    const name = request.name.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP server name is invalid.',
      );
    }

    let result;
    try {
      result = await this.runProcess({
        command: this.command,
        args: ['mcp', 'get', name, '--json'],
        cwd: request.cwd,
        timeoutMs: this.timeoutMs,
        label: 'Codex MCP inspection',
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
        'Codex MCP inspection failed.',
      );
    }

    if (result.signal !== null || result.exitCode !== 0) {
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Codex MCP inspection returned a non-zero result.',
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Codex MCP inspection returned invalid JSON.',
      );
    }

    if (!payload || typeof payload !== 'object') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Codex MCP inspection returned an unexpected payload.',
      );
    }

    const item = payload as {
      name?: unknown;
      enabled?: unknown;
      transport?: unknown;
      enabled_tools?: unknown;
      disabled_tools?: unknown;
      startup_timeout_sec?: unknown;
      tool_timeout_sec?: unknown;
    };
    if (item.name !== name || typeof item.enabled !== 'boolean') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Codex MCP inspection returned invalid server metadata.',
      );
    }

    const normalizeTools = (value: unknown): string[] | undefined => {
      if (value === null || value === undefined) return undefined;
      if (
        !Array.isArray(value) ||
        value.some((tool) => typeof tool !== 'string')
      ) {
        throw new AgentIntegrationDiscoveryError(
          'invalid-response',
          'Codex MCP inspection returned an invalid tool list.',
        );
      }
      return value;
    };
    const normalizeTimeout = (value: unknown): number | undefined => {
      if (value === null || value === undefined) return undefined;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new AgentIntegrationDiscoveryError(
          'invalid-response',
          'Codex MCP inspection returned an invalid timeout.',
        );
      }
      return value;
    };

    let transportType: AgentIntegrationDetails['transportType'];
    if (item.transport && typeof item.transport === 'object') {
      const type = (item.transport as { type?: unknown }).type;
      if (type === 'stdio') transportType = 'stdio';
      if (type === 'streamable_http') transportType = 'streamable-http';
    }

    const enabledTools = normalizeTools(item.enabled_tools);
    const disabledTools = normalizeTools(item.disabled_tools);
    const startupTimeoutSec = normalizeTimeout(item.startup_timeout_sec);
    const toolTimeoutSec = normalizeTimeout(item.tool_timeout_sec);

    return {
      id: 'codex:mcp-server:' + name,
      providerId: 'codex',
      kind: 'mcp-server',
      name,
      enabled: item.enabled,
      ...(transportType ? { transportType } : {}),
      ...(enabledTools ? { enabledTools } : {}),
      ...(disabledTools ? { disabledTools } : {}),
      ...(startupTimeoutSec !== undefined ? { startupTimeoutSec } : {}),
      ...(toolTimeoutSec !== undefined ? { toolTimeoutSec } : {}),
    };
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
      scope: 'user',
      origin: 'codex-global-config',
      enabled: true,
      authStatus: 'unknown',
    };
  }

  async uninstall(
    request: AgentIntegrationUninstallRequest,
  ): Promise<AgentIntegrationUninstallResult> {
    if (!request.confirmed) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP removal requires explicit confirmation.',
      );
    }
    if (request.kind !== 'mcp-server') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex only supports MCP removal through this adapter.',
      );
    }
    if (request.scope !== 'user') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP removal currently targets only explicit user scope.',
      );
    }

    const name = request.name.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP server name is invalid.',
      );
    }

    let result;
    try {
      result = await this.runProcess({
        command: this.command,
        args: ['mcp', 'remove', name],
        cwd: request.cwd,
        timeoutMs: this.timeoutMs,
        label: 'Codex MCP removal',
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
        'Codex MCP removal failed.',
      );
    }

    if (result.signal !== null || result.exitCode !== 0) {
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Codex MCP removal returned a non-zero result.',
      );
    }

    const discovery = await this.list({ cwd: request.cwd });
    if (
      discovery.integrations.some((integration) => integration.name === name)
    ) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Codex MCP server remains configured in the effective project context; global removal could not be confirmed.',
      );
    }

    return {
      providerId: 'codex',
      kind: 'mcp-server',
      name,
      scope: 'user',
      dataPreserved: true,
    };
  }
}

interface ClaudePluginIntegrationProviderOptions {
  command?: string;
  runProcess?: AgentCliProcessRunner;
  timeoutMs?: number;
}

export class ClaudePluginIntegrationProvider implements AgentIntegrationProvider {
  readonly id = 'claude-code' as const;
  private readonly command: string;
  private readonly runProcess: AgentCliProcessRunner;
  private readonly timeoutMs: number;

  constructor(options: ClaudePluginIntegrationProviderOptions = {}) {
    this.command = options.command ?? 'claude';
    this.runProcess = options.runProcess ?? runAgentCliProcess;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async list(
    request: AgentIntegrationListRequest,
  ): Promise<AgentIntegrationListResult> {
    let result;
    try {
      result = await this.runProcess({
        command: this.command,
        args: ['plugin', 'list', '--json'],
        cwd: request.cwd,
        timeoutMs: this.timeoutMs,
        label: 'Claude plugin discovery',
      });
    } catch (error) {
      if (
        error instanceof AgentCliProcessError &&
        error.code === 'spawn-failed'
      ) {
        throw new AgentIntegrationDiscoveryError(
          'provider-unavailable',
          'Claude command is unavailable.',
        );
      }
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Claude plugin discovery failed.',
      );
    }

    if (result.signal !== null || result.exitCode !== 0) {
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Claude plugin discovery returned a non-zero result.',
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Claude plugin discovery returned invalid JSON.',
      );
    }

    if (!Array.isArray(payload)) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Claude plugin discovery returned an unexpected payload.',
      );
    }

    const integrations: AgentIntegration[] = [];
    const issues: AgentIntegrationIssue[] = [];
    const validScopes = new Set<AgentIntegrationScope>([
      'user',
      'project',
      'local',
      'managed',
    ]);

    for (const [index, entry] of payload.entries()) {
      if (!entry || typeof entry !== 'object') {
        issues.push({
          code: 'invalid-entry',
          index,
          message: 'Claude plugin discovery ignored an invalid plugin entry.',
        });
        continue;
      }

      const item = entry as {
        id?: unknown;
        version?: unknown;
        scope?: unknown;
        enabled?: unknown;
      };
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const scope =
        typeof item.scope === 'string' &&
        validScopes.has(item.scope as AgentIntegrationScope)
          ? (item.scope as AgentIntegrationScope)
          : undefined;

      if (
        !id ||
        id.length > 256 ||
        /[\u0000-\u001f\u007f]/.test(id) ||
        !scope ||
        typeof item.enabled !== 'boolean'
      ) {
        issues.push({
          code: 'invalid-entry',
          index,
          message: 'Claude plugin discovery ignored an invalid plugin entry.',
        });
        continue;
      }

      const at = id.lastIndexOf('@');
      const pluginName = at > 0 ? id.slice(0, at) : id;
      const marketplace = at > 0 && at < id.length - 1 ? id.slice(at + 1) : '';
      const safeMarketplace =
        marketplace &&
        marketplace.length <= 128 &&
        /^[A-Za-z0-9._-]+$/.test(marketplace)
          ? marketplace
          : undefined;
      const version =
        typeof item.version === 'string' &&
        item.version.trim() &&
        item.version.length <= 128 &&
        !/[\u0000-\u001f\u007f]/.test(item.version)
          ? item.version.trim()
          : undefined;

      integrations.push({
        id: 'claude-code:plugin:' + id,
        providerId: 'claude-code',
        kind: 'plugin',
        name: pluginName,
        scope,
        origin: 'claude-plugin-inventory',
        ...(version ? { version } : {}),
        ...(safeMarketplace ? { marketplace: safeMarketplace } : {}),
        enabled: item.enabled,
        authStatus: 'unsupported',
      });
    }

    let marketplaceResult;
    try {
      marketplaceResult = await this.runProcess({
        command: this.command,
        args: ['plugin', 'marketplace', 'list', '--json'],
        cwd: request.cwd,
        timeoutMs: this.timeoutMs,
        label: 'Claude marketplace discovery',
      });
    } catch {
      issues.push({
        code: 'source-unavailable',
        source: 'marketplace',
        message: 'Claude marketplace discovery is unavailable.',
      });
      return { integrations, issues };
    }

    if (marketplaceResult.signal !== null || marketplaceResult.exitCode !== 0) {
      issues.push({
        code: 'source-unavailable',
        source: 'marketplace',
        message: 'Claude marketplace discovery returned a non-zero result.',
      });
      return { integrations, issues };
    }

    let marketplacePayload: unknown;
    try {
      marketplacePayload = JSON.parse(marketplaceResult.stdout);
    } catch {
      issues.push({
        code: 'source-unavailable',
        source: 'marketplace',
        message: 'Claude marketplace discovery returned invalid JSON.',
      });
      return { integrations, issues };
    }

    if (!Array.isArray(marketplacePayload)) {
      issues.push({
        code: 'source-unavailable',
        source: 'marketplace',
        message: 'Claude marketplace discovery returned an unexpected payload.',
      });
      return { integrations, issues };
    }

    const normalizeMarketplaceSource = (
      value: unknown,
      hasClaudeAiId: boolean,
    ): AgentIntegrationMarketplaceSource => {
      const raw =
        typeof value === 'string'
          ? value
          : value && typeof value === 'object'
            ? (value as { source?: unknown }).source
            : undefined;
      if (raw === 'github') return 'github';
      if (raw === 'git') return 'git';
      if (raw === 'url') return 'url';
      if (raw === 'local') return 'local';
      if (raw === 'claude.ai' || raw === 'claudeai' || hasClaudeAiId) {
        return 'claude-ai';
      }
      return 'unknown';
    };

    for (const [index, entry] of marketplacePayload.entries()) {
      if (!entry || typeof entry !== 'object') {
        issues.push({
          code: 'invalid-entry',
          source: 'marketplace',
          index,
          message:
            'Claude marketplace discovery ignored an invalid marketplace entry.',
        });
        continue;
      }

      const item = entry as {
        name?: unknown;
        source?: unknown;
        marketplaceId?: unknown;
      };
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (
        !name ||
        name.length > 128 ||
        /[\u0000-\u001f\u007f]/.test(name)
      ) {
        issues.push({
          code: 'invalid-entry',
          source: 'marketplace',
          index,
          message:
            'Claude marketplace discovery ignored an invalid marketplace entry.',
        });
        continue;
      }

      integrations.push({
        id: 'claude-code:marketplace:' + name,
        providerId: 'claude-code',
        kind: 'marketplace',
        name,
        origin: 'claude-marketplace-inventory',
        marketplaceSource: normalizeMarketplaceSource(
          item.source,
          typeof item.marketplaceId === 'string' && Boolean(item.marketplaceId),
        ),
        authStatus: 'unsupported',
      });
    }

    return { integrations, issues };
  }

  async setEnabled(
    request: AgentIntegrationSetEnabledRequest,
  ): Promise<AgentIntegration> {
    if (request.kind !== 'plugin') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Claude only supports plugin enablement through this adapter.',
      );
    }

    const name = request.name.trim();
    const marketplace = request.marketplace?.trim() ?? '';
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(marketplace)
    ) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Claude plugin identity is invalid.',
      );
    }
    if (
      request.scope !== 'user' &&
      request.scope !== 'project' &&
      request.scope !== 'local'
    ) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Claude managed plugins cannot be changed by this adapter.',
      );
    }

    const command = request.enabled ? 'enable' : 'disable';
    const pluginId = name + '@' + marketplace;
    let result;
    try {
      result = await this.runProcess({
        command: this.command,
        args: ['plugin', command, pluginId, '--scope', request.scope, '--json'],
        cwd: request.cwd,
        timeoutMs: this.timeoutMs,
        label: 'Claude plugin ' + command,
      });
    } catch (error) {
      if (
        error instanceof AgentCliProcessError &&
        error.code === 'spawn-failed'
      ) {
        throw new AgentIntegrationDiscoveryError(
          'provider-unavailable',
          'Claude command is unavailable.',
        );
      }
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Claude plugin ' + command + ' failed.',
      );
    }

    if (result.signal !== null || result.exitCode !== 0) {
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Claude plugin ' + command + ' returned a non-zero result.',
      );
    }

    const lines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let payload: unknown;
    try {
      payload = JSON.parse(lines.at(-1) ?? '');
    } catch {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Claude plugin ' + command + ' returned invalid JSON.',
      );
    }

    if (!payload || typeof payload !== 'object') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Claude plugin ' + command + ' returned an unexpected payload.',
      );
    }

    const item = payload as {
      command?: unknown;
      outcome?: unknown;
      pluginId?: unknown;
      scope?: unknown;
    };
    if (
      item.command !== command ||
      item.outcome !== 'ok' ||
      (item.pluginId !== undefined && item.pluginId !== pluginId) ||
      (item.scope !== undefined && item.scope !== request.scope)
    ) {
      throw new AgentIntegrationDiscoveryError(
        item.outcome === 'failed' ? 'command-failed' : 'invalid-response',
        'Claude plugin ' + command + ' did not confirm the requested change.',
      );
    }

    return {
      id: 'claude-code:plugin:' + pluginId,
      providerId: 'claude-code',
      kind: 'plugin',
      name,
      scope: request.scope,
      origin: 'claude-plugin-inventory',
      marketplace,
      enabled: request.enabled,
      authStatus: 'unsupported',
    };
  }

  async uninstall(
    request: AgentIntegrationUninstallRequest,
  ): Promise<AgentIntegrationUninstallResult> {
    if (!request.confirmed) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Claude plugin uninstall requires explicit confirmation.',
      );
    }
    if (request.kind !== 'plugin') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Claude only supports plugin uninstall through this adapter.',
      );
    }

    const name = request.name.trim();
    const marketplace = request.marketplace?.trim() ?? '';
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(marketplace)
    ) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Claude plugin identity is invalid.',
      );
    }
    if (
      request.scope !== 'user' &&
      request.scope !== 'project' &&
      request.scope !== 'local'
    ) {
      throw new AgentIntegrationDiscoveryError(
        'invalid-request',
        'Claude managed plugins cannot be uninstalled by this adapter.',
      );
    }

    const pluginId = name + '@' + marketplace;
    let result;
    try {
      result = await this.runProcess({
        command: this.command,
        args: [
          'plugin',
          'uninstall',
          pluginId,
          '--scope',
          request.scope,
          '--keep-data',
          '--json',
        ],
        cwd: request.cwd,
        timeoutMs: this.timeoutMs,
        label: 'Claude plugin uninstall',
      });
    } catch (error) {
      if (
        error instanceof AgentCliProcessError &&
        error.code === 'spawn-failed'
      ) {
        throw new AgentIntegrationDiscoveryError(
          'provider-unavailable',
          'Claude command is unavailable.',
        );
      }
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Claude plugin uninstall failed.',
      );
    }

    if (result.signal !== null || result.exitCode !== 0) {
      throw new AgentIntegrationDiscoveryError(
        'command-failed',
        'Claude plugin uninstall returned a non-zero result.',
      );
    }

    const lines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let payload: unknown;
    try {
      payload = JSON.parse(lines.at(-1) ?? '');
    } catch {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Claude plugin uninstall returned invalid JSON.',
      );
    }

    if (!payload || typeof payload !== 'object') {
      throw new AgentIntegrationDiscoveryError(
        'invalid-response',
        'Claude plugin uninstall returned an unexpected payload.',
      );
    }

    const item = payload as {
      command?: unknown;
      outcome?: unknown;
      pluginId?: unknown;
      scope?: unknown;
    };
    if (
      item.command !== 'uninstall' ||
      item.outcome !== 'ok' ||
      (item.pluginId !== undefined && item.pluginId !== pluginId) ||
      (item.scope !== undefined && item.scope !== request.scope)
    ) {
      throw new AgentIntegrationDiscoveryError(
        item.outcome === 'failed' ? 'command-failed' : 'invalid-response',
        'Claude plugin uninstall did not confirm the requested removal.',
      );
    }

    return {
      providerId: 'claude-code',
      kind: 'plugin',
      name,
      scope: request.scope,
      marketplace,
      dataPreserved: true,
    };
  }
}

export class BrowserCapabilityIntegrationProvider implements AgentIntegrationProvider {
  readonly id = 'chatgpt-browser' as const;

  async list(): Promise<AgentIntegrationListResult> {
    return {
      integrations: BROWSER_TOOL_NAMES.map((tool) => ({
        id: 'chatgpt-browser:browser-capability:' + tool,
        providerId: 'chatgpt-browser',
        kind: 'browser-capability',
        name: tool,
        scope: 'session',
        origin: 'browser-local-allowlist',
        enabled: true,
        authStatus: 'unsupported',
      })),
      issues: [],
    };
  }
}

export function createDefaultAgentIntegrationProviderRegistry(): AgentIntegrationProviderRegistry {
  return new StaticAgentIntegrationProviderRegistry([
    new CodexMcpIntegrationProvider(),
    new ClaudePluginIntegrationProvider(),
    new BrowserCapabilityIntegrationProvider(),
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
          scopes: ['user'],
          operations: ['list', 'inspect', 'install', 'uninstall'],
          availability: 'supported',
          reason:
            'Discovery uses the effective Codex configuration and does not expose origin; install and uninstall target explicit user-global configuration only.',
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
          operations: [],
          availability: 'unavailable',
          reason:
            'Claude MCP management is not advertised until a stable machine-readable discovery adapter is wired.',
        },
        {
          kind: 'skill',
          scopes: ['user', 'project'],
          operations: [],
          availability: 'unavailable',
          reason:
            'Claude skills are not managed until a stable machine-readable discovery adapter is wired.',
        },
        {
          kind: 'plugin',
          scopes: ['user', 'project', 'local', 'managed'],
          operations: ['list', 'enable', 'disable', 'uninstall'],
          availability: 'supported',
          reason:
            'Managed plugins are listed read-only; enable and disable apply only to user, project, and local scopes.',
        },
        {
          kind: 'marketplace',
          scopes: ['user', 'project'],
          operations: ['list'],
          availability: 'supported',
          reason:
            'Marketplace discovery is read-only and exposes only sanitized source type; local paths and source URLs are not returned.',
        },
      ],
    },
    {
      providerId: 'chatgpt-browser',
      integrations: [
        {
          kind: 'browser-capability',
          scopes: ['session'],
          operations: ['list'],
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
