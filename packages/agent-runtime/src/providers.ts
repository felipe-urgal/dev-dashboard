import path from 'node:path';

import {
  ChatGptBrowserAgentProvider,
  type ChatGptBrowserAgentProviderOptions,
} from './browser-provider.js';
import type {
  AgentConcreteProviderId,
  AgentProvider,
  AgentProviderAvailability,
  AgentProviderExecutionRequest,
  AgentProviderId,
  AgentProviderRegistry,
  AgentProviderResult,
  AgentProviderStatus,
  AgentUsage,
} from './contracts.js';
import {
  AgentCliProcessError,
  runAgentCliProcess,
  type AgentCliProcessRequest,
  type AgentCliProcessResult,
  type AgentCliProcessRunner,
} from './cli-process.js';

const DEFAULT_EXECUTION_TIMEOUT_MS = 45 * 60 * 1000;
const DEFAULT_PROBE_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_SUMMARY_CHARS = 32_000;
const CLAUDE_CODE_MIN_VERSION = [2, 1, 259] as const;
const LOCAL_PROVIDER_IDS = ['codex', 'claude-code'] as const;
const ALL_PROVIDER_IDS = [
  'automatic',
  'codex',
  'claude-code',
  'chatgpt-browser',
] as const satisfies readonly AgentProviderId[];

export type AgentProviderErrorCode =
  | 'duplicate-provider'
  | 'invalid-cwd'
  | 'invalid-request'
  | 'no-compatible-provider'
  | 'provider-not-registered'
  | 'provider-unavailable'
  | 'unknown-provider';

export class AgentProviderError extends Error {
  readonly providerId: AgentProviderId | undefined;

  constructor(
    readonly code: AgentProviderErrorCode,
    message: string,
    providerId?: AgentProviderId,
  ) {
    super(message);
    this.name = 'AgentProviderError';
    this.providerId = providerId;
  }
}

export type AgentExecutionCwdResolver = (
  request: AgentProviderExecutionRequest,
) => string | Promise<string>;

export interface LocalAgentProviderOptions {
  resolveCwd: AgentExecutionCwdResolver;
  runProcess?: AgentCliProcessRunner;
  command?: string;
  probeCwd?: string;
  executionTimeoutMs?: number;
  probeTimeoutMs?: number;
  now?: () => string;
}

export interface AutomaticAgentProviderOptions {
  registry: AgentProviderRegistry;
  preferredProviderId?: AgentConcreteProviderId;
  fallbackOrder?: readonly AgentConcreteProviderId[];
  now?: () => string;
}

export interface LocalAgentProviderRegistryOptions extends Omit<
  LocalAgentProviderOptions,
  'command'
> {
  codexCommand?: string;
  claudeCommand?: string;
  preferredProviderId?: AgentConcreteProviderId;
  fallbackOrder?: readonly AgentConcreteProviderId[];
  browser?: ChatGptBrowserAgentProviderOptions;
}

class ProviderProbeError extends Error {
  constructor(
    readonly availability: AgentProviderAvailability,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderProbeError';
  }
}

interface ProviderRuntimeOptions {
  resolveCwd: AgentExecutionCwdResolver;
  runProcess: AgentCliProcessRunner;
  command: string;
  probeCwd: string;
  executionTimeoutMs: number;
  probeTimeoutMs: number;
  now: () => string;
}

function resolveRuntimeOptions(
  options: LocalAgentProviderOptions,
  defaultCommand: string,
): ProviderRuntimeOptions {
  if (typeof options.resolveCwd !== 'function') {
    throw new Error('resolveCwd is required');
  }

  return {
    resolveCwd: options.resolveCwd,
    runProcess: options.runProcess ?? runAgentCliProcess,
    command: options.command ?? defaultCommand,
    probeCwd: options.probeCwd ?? process.cwd(),
    executionTimeoutMs:
      options.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS,
    probeTimeoutMs: options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
    now: options.now ?? (() => new Date().toISOString()),
  };
}

function isProviderId(value: string): value is AgentProviderId {
  return (ALL_PROVIDER_IDS as readonly string[]).includes(value);
}

function providerVersion(result: AgentCliProcessResult): string {
  return String(result.stdout || result.stderr || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 120);
}

function probeReason(error: unknown): {
  availability: AgentProviderAvailability;
  reason: string;
} {
  if (error instanceof ProviderProbeError) {
    return {
      availability: error.availability,
      reason: error.message,
    };
  }

  if (error instanceof AgentCliProcessError && error.code === 'spawn-failed') {
    return {
      availability: 'unavailable',
      reason: 'provider command unavailable',
    };
  }

  if (error instanceof AgentCliProcessError && error.code === 'timeout') {
    return {
      availability: 'degraded',
      reason: 'provider preflight timed out',
    };
  }

  return {
    availability: 'degraded',
    reason: 'provider preflight failed',
  };
}

async function runProbe(
  options: ProviderRuntimeOptions,
  label: string,
  args: readonly string[],
): Promise<AgentCliProcessResult> {
  const result = await options.runProcess({
    command: options.command,
    args,
    cwd: options.probeCwd,
    timeoutMs: options.probeTimeoutMs,
    label,
  });

  if (result.signal !== null || result.exitCode !== 0) {
    throw new ProviderProbeError(
      'degraded',
      label + ' preflight returned a non-zero result',
    );
  }

  return result;
}

function validateSummary(request: AgentProviderExecutionRequest): void {
  const summary = request.summary.trim();
  if (!summary) {
    throw new AgentProviderError(
      'invalid-request',
      'provider request summary is required',
    );
  }

  if (summary.length > MAX_PROVIDER_SUMMARY_CHARS) {
    throw new AgentProviderError(
      'invalid-request',
      'provider request summary exceeds the supported limit',
    );
  }
}

async function resolveOwnedCwd(
  resolver: AgentExecutionCwdResolver,
  request: AgentProviderExecutionRequest,
): Promise<string> {
  const value = String(await resolver(request)).trim();
  if (!value || value.includes('\0') || !path.isAbsolute(value)) {
    throw new AgentProviderError(
      'invalid-cwd',
      'provider cwd must be an absolute backend-owned path',
    );
  }

  return path.normalize(value);
}

function buildProviderPrompt(request: AgentProviderExecutionRequest): string {
  validateSummary(request);
  const capabilities =
    request.allowedCapabilities.length > 0
      ? request.allowedCapabilities.join(', ')
      : 'none';

  return [
    request.summary.trim(),
    ...(request.continuationInstruction
      ? [
          '',
          'Continuation instruction:',
          request.continuationInstruction.trim(),
        ]
      : []),
    '',
    'Execution boundary:',
    '- Work only inside the backend-selected working directory.',
    '- Granted capabilities: ' + capabilities + '.',
    '- Do not perform capabilities that are not listed above.',
    '- If a protected action is needed but not granted, stop and report it.',
  ].join('\n');
}

function normalizeExecutionFailure(
  providerId: AgentConcreteProviderId,
  label: string,
  error: unknown,
): AgentProviderResult {
  if (error instanceof AgentCliProcessError) {
    if (error.code === 'cancelled') {
      return {
        providerId,
        outcome: 'cancelled',
        summary: label + ' execution cancelled',
        failure: {
          kind: 'known',
          code: 'cancelled',
          message: label + ' execution cancelled',
        },
      };
    }

    if (error.code === 'termination-timeout') {
      return {
        providerId,
        outcome: 'unknown',
        summary: label + ' process termination is ambiguous',
        failure: {
          kind: 'ambiguous',
          code: 'provider-termination-ambiguous',
          message: label + ' process termination could not be confirmed',
        },
      };
    }

    const code =
      error.code === 'timeout'
        ? 'provider-timeout'
        : error.code === 'output-limit'
          ? 'provider-output-limit'
          : 'provider-start-failed';

    return {
      providerId,
      outcome: 'failed',
      summary: label + ' execution failed',
      failure: {
        kind: 'known',
        code,
        message: label + ' execution failed',
      },
    };
  }

  return {
    providerId,
    outcome: 'unknown',
    summary: label + ' execution result is unknown',
    failure: {
      kind: 'ambiguous',
      code: 'provider-error-unknown',
      message: label + ' execution ended with an unknown error',
    },
  };
}

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined;
}

function codexUsageFromJsonl(stdout: string): AgentUsage | undefined {
  let normalized: AgentUsage | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;

    let event: unknown;
    try {
      event = JSON.parse(value);
    } catch {
      continue;
    }

    if (
      !event ||
      typeof event !== 'object' ||
      (event as { type?: unknown }).type !== 'turn.completed'
    ) {
      continue;
    }

    const rawUsage = (event as { usage?: unknown }).usage;
    if (!rawUsage || typeof rawUsage !== 'object') continue;
    const usage = rawUsage as Record<string, unknown>;

    const inputTokens = nonNegativeInteger(usage.input_tokens);
    const cachedInputTokens = nonNegativeInteger(usage.cached_input_tokens);
    const cacheWriteInputTokens = nonNegativeInteger(
      usage.cache_write_input_tokens,
    );
    const outputTokens = nonNegativeInteger(usage.output_tokens);
    const reasoningTokens = nonNegativeInteger(usage.reasoning_output_tokens);
    const totalTokens = nonNegativeInteger(usage.total_tokens);

    if (
      inputTokens === undefined &&
      cachedInputTokens === undefined &&
      cacheWriteInputTokens === undefined &&
      outputTokens === undefined &&
      reasoningTokens === undefined &&
      totalTokens === undefined
    ) {
      continue;
    }

    normalized = {
      providerId: 'codex',
      source: 'provider',
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      ...(cacheWriteInputTokens !== undefined
        ? { cacheWriteInputTokens }
        : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
      ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
      ...(totalTokens !== undefined ? { totalTokens } : {}),
    };
  }

  return normalized;
}

function normalizeProcessResult(
  providerId: AgentConcreteProviderId,
  label: string,
  result: AgentCliProcessResult,
  usage?: AgentUsage,
): AgentProviderResult {
  if (result.signal !== null || result.exitCode === null) {
    return {
      providerId,
      outcome: 'unknown',
      summary: label + ' process ended without a terminal exit code',
      failure: {
        kind: 'ambiguous',
        code: 'provider-exit-unknown',
        message: label + ' process ended without a terminal exit code',
      },
    };
  }

  if (result.exitCode === 0) {
    return {
      providerId,
      outcome: 'succeeded',
      summary: label + ' completed successfully',
      ...(usage ? { usage } : {}),
    };
  }

  return {
    providerId,
    outcome: 'failed',
    summary: label + ' exited unsuccessfully',
    failure: {
      kind: 'known',
      code: 'provider-exit-' + result.exitCode,
      message: label + ' exited with a non-zero status',
    },
    ...(usage ? { usage } : {}),
  };
}

abstract class LocalCliAgentProvider implements AgentProvider {
  abstract readonly id: AgentConcreteProviderId;
  protected abstract readonly label: string;
  protected readonly runtime: ProviderRuntimeOptions;

  protected constructor(
    options: LocalAgentProviderOptions,
    defaultCommand: string,
  ) {
    this.runtime = resolveRuntimeOptions(options, defaultCommand);
  }

  protected abstract probe(): Promise<string>;

  protected abstract executionArgs(
    request: AgentProviderExecutionRequest,
    prompt: string,
  ): readonly string[];

  protected usage(_result: AgentCliProcessResult): AgentUsage | undefined {
    return undefined;
  }

  async status(): Promise<AgentProviderStatus> {
    try {
      const version = await this.probe();
      return {
        providerId: this.id,
        availability: 'available',
        observedAt: this.runtime.now(),
        ...(version ? { version } : {}),
      };
    } catch (error) {
      const failure = probeReason(error);
      return {
        providerId: this.id,
        availability: failure.availability,
        observedAt: this.runtime.now(),
        reason: failure.reason,
      };
    }
  }

  supports(): boolean {
    return true;
  }

  async execute(
    request: AgentProviderExecutionRequest,
  ): Promise<AgentProviderResult> {
    const status = await this.status();
    if (status.availability !== 'available') {
      throw new AgentProviderError(
        'provider-unavailable',
        this.label + ' provider is not available',
        this.id,
      );
    }

    const cwd = await resolveOwnedCwd(this.runtime.resolveCwd, request);
    const prompt = buildProviderPrompt(request);

    const processRequest: AgentCliProcessRequest = {
      command: this.runtime.command,
      args: this.executionArgs(request, prompt),
      cwd,
      timeoutMs: this.runtime.executionTimeoutMs,
      label: this.label,
      ...(request.signal ? { signal: request.signal } : {}),
    };

    try {
      const result = await this.runtime.runProcess(processRequest);
      return normalizeProcessResult(
        this.id,
        this.label,
        result,
        this.usage(result),
      );
    } catch (error) {
      return normalizeExecutionFailure(this.id, this.label, error);
    }
  }
}

export class CodexAgentProvider extends LocalCliAgentProvider {
  readonly id = 'codex' as const;
  protected readonly label = 'Codex';

  constructor(options: LocalAgentProviderOptions) {
    super(options, 'codex');
  }

  protected async probe(): Promise<string> {
    const versionResult = await runProbe(this.runtime, this.label, [
      '--version',
    ]);
    const version = providerVersion(versionResult);
    if (!version) {
      throw new ProviderProbeError(
        'degraded',
        'Codex version could not be determined',
      );
    }

    await runProbe(this.runtime, this.label, ['login', 'status']);
    return version;
  }

  protected executionArgs(
    request: AgentProviderExecutionRequest,
    prompt: string,
  ): readonly string[] {
    const sandbox = request.allowedCapabilities.includes('workspace:write')
      ? 'workspace-write'
      : 'read-only';

    return [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--sandbox',
      sandbox,
      '--ask-for-approval',
      'never',
      prompt,
    ];
  }

  protected usage(result: AgentCliProcessResult): AgentUsage | undefined {
    return codexUsageFromJsonl(result.stdout);
  }
}

export class ClaudeCodeAgentProvider extends LocalCliAgentProvider {
  readonly id = 'claude-code' as const;
  protected readonly label = 'Claude Code';

  constructor(options: LocalAgentProviderOptions) {
    super(options, 'claude');
  }

  protected async probe(): Promise<string> {
    const versionResult = await runProbe(this.runtime, this.label, [
      '--version',
    ]);
    const versionText = providerVersion(versionResult);
    const match = versionText.match(/(\d+)\.(\d+)\.(\d+)/);

    if (!match) {
      throw new ProviderProbeError(
        'degraded',
        'Claude Code version could not be determined',
      );
    }

    const version = match.slice(1).map(Number);
    const comparison =
      (version[0] ?? 0) - CLAUDE_CODE_MIN_VERSION[0] ||
      (version[1] ?? 0) - CLAUDE_CODE_MIN_VERSION[1] ||
      (version[2] ?? 0) - CLAUDE_CODE_MIN_VERSION[2];

    if (comparison < 0) {
      throw new ProviderProbeError(
        'degraded',
        'Claude Code version is below the supported minimum',
      );
    }

    await runProbe(this.runtime, this.label, ['auth', 'status']);
    return versionText;
  }

  protected executionArgs(
    _request: AgentProviderExecutionRequest,
    prompt: string,
  ): readonly string[] {
    return [
      '-p',
      '--permission-mode',
      'auto',
      '--permission-prompts',
      'none',
      '--no-session-persistence',
      '--output-format',
      'text',
      prompt,
    ];
  }
}

export class StaticAgentProviderRegistry implements AgentProviderRegistry {
  private readonly providers = new Map<AgentProviderId, AgentProvider>();

  constructor(providers: readonly AgentProvider[]) {
    for (const provider of providers) {
      if (this.providers.has(provider.id)) {
        throw new AgentProviderError(
          'duplicate-provider',
          'duplicate provider registration: ' + provider.id,
          provider.id,
        );
      }
      this.providers.set(provider.id, provider);
    }
  }

  get(providerId: AgentProviderId): AgentProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  list(): AgentProvider[] {
    return [...this.providers.values()];
  }

  require(providerId: string): AgentProvider {
    if (!isProviderId(providerId)) {
      throw new AgentProviderError(
        'unknown-provider',
        'unknown provider: ' + providerId,
      );
    }

    const provider = this.get(providerId);
    if (!provider) {
      throw new AgentProviderError(
        'provider-not-registered',
        'provider is not registered: ' + providerId,
        providerId,
      );
    }

    return provider;
  }
}

function uniqueProviderOrder(
  preferredProviderId: AgentConcreteProviderId | undefined,
  fallbackOrder: readonly AgentConcreteProviderId[],
): AgentConcreteProviderId[] {
  return [
    ...new Set([
      ...(preferredProviderId ? [preferredProviderId] : []),
      ...fallbackOrder,
    ]),
  ];
}

export class AutomaticAgentProvider implements AgentProvider {
  readonly id = 'automatic' as const;
  private readonly order: AgentConcreteProviderId[];
  private readonly now: () => string;

  constructor(private readonly options: AutomaticAgentProviderOptions) {
    this.order = uniqueProviderOrder(
      options.preferredProviderId,
      options.fallbackOrder ?? LOCAL_PROVIDER_IDS,
    );
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async status(): Promise<AgentProviderStatus> {
    for (const providerId of this.order) {
      const provider = this.options.registry.get(providerId);
      if (!provider) continue;
      const status = await provider.status();
      if (status.availability === 'available') {
        return {
          providerId: this.id,
          availability: 'available',
          observedAt: this.now(),
          reason: 'selected ' + providerId,
        };
      }
    }

    return {
      providerId: this.id,
      availability: 'unavailable',
      observedAt: this.now(),
      reason: 'no healthy compatible provider is available',
    };
  }

  async execute(
    request: AgentProviderExecutionRequest,
  ): Promise<AgentProviderResult> {
    for (const providerId of this.order) {
      const provider = this.options.registry.get(providerId);
      if (!provider) continue;

      const compatible = provider.supports
        ? await provider.supports(request)
        : true;
      if (!compatible) continue;

      const status = await provider.status();
      if (status.availability !== 'available') continue;

      // Once selected, execute exactly this provider. A runtime failure does not
      // silently switch provider after work may already have started.
      return provider.execute(request);
    }

    throw new AgentProviderError(
      'no-compatible-provider',
      'no healthy compatible provider is available',
      this.id,
    );
  }
}

export function createLocalAgentProviderRegistry(
  options: LocalAgentProviderRegistryOptions,
): StaticAgentProviderRegistry {
  const common = {
    resolveCwd: options.resolveCwd,
    ...(options.runProcess ? { runProcess: options.runProcess } : {}),
    ...(options.probeCwd ? { probeCwd: options.probeCwd } : {}),
    ...(options.executionTimeoutMs
      ? { executionTimeoutMs: options.executionTimeoutMs }
      : {}),
    ...(options.probeTimeoutMs
      ? { probeTimeoutMs: options.probeTimeoutMs }
      : {}),
    ...(options.now ? { now: options.now } : {}),
  } satisfies Omit<LocalAgentProviderOptions, 'command'>;

  const codex = new CodexAgentProvider({
    ...common,
    ...(options.codexCommand ? { command: options.codexCommand } : {}),
  });
  const claude = new ClaudeCodeAgentProvider({
    ...common,
    ...(options.claudeCommand ? { command: options.claudeCommand } : {}),
  });

  const browser = options.browser
    ? new ChatGptBrowserAgentProvider(options.browser)
    : null;
  const concreteProviders: AgentProvider[] = [
    codex,
    claude,
    ...(browser ? [browser] : []),
  ];
  const concreteRegistry = new StaticAgentProviderRegistry(concreteProviders);
  const automatic = new AutomaticAgentProvider({
    registry: concreteRegistry,
    ...(options.preferredProviderId
      ? { preferredProviderId: options.preferredProviderId }
      : {}),
    ...(options.fallbackOrder ? { fallbackOrder: options.fallbackOrder } : {}),
    ...(options.now ? { now: options.now } : {}),
  });

  return new StaticAgentProviderRegistry([
    automatic,
    codex,
    claude,
    ...(browser ? [browser] : []),
  ]);
}
