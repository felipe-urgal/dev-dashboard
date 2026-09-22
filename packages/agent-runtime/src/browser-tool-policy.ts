import path from 'node:path';

import type { AgentCapability } from './contracts.js';

export const BROWSER_TOOL_NAMES = [
  'list_files',
  'read_file',
  'search_text',
  'git_status',
  'git_diff',
  'git_log',
  'git_branch',
  'apply_patch',
  'run_process',
] as const;

export type BrowserToolName = (typeof BROWSER_TOOL_NAMES)[number];

const BROWSER_TOOL_NAME_SET = new Set<string>(BROWSER_TOOL_NAMES);
const MUTATING_BROWSER_TOOLS = new Set<BrowserToolName>([
  'apply_patch',
  'run_process',
]);

export const DEFAULT_BROWSER_TOOL_LIMITS = Object.freeze({
  maxFileBytes: 512 * 1024,
  maxOutputBytes: 64 * 1024,
  maxListEntries: 200,
  maxSearchResults: 100,
  maxSearchFiles: 2_000,
  maxPatchBytes: 128 * 1024,
  maxProcessTimeoutMs: 120_000,
});

export const ALLOWED_BROWSER_PROCESS_EXECUTABLES = new Set([
  'node',
  'npm',
  'pnpm',
  'yarn',
]);

const SENSITIVE_BASENAME_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^\.(?:npmrc|netrc|pypirc)$/i,
  /^\.yarnrc(?:\.yml)?$/i,
  /^credentials$/i,
  /^.+\.(?:pem|key|p12|pfx)$/i,
  /^id_rsa.*$/i,
  /^id_ed25519.*$/i,
];

const SHELL_META_PATTERN = /(?:&&|\|\||[;&|<>\`\n\r]|\$\()/;
const WINDOWS_ABSOLUTE_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATTERN = /^\\\\/;

export interface BrowserToolPolicy {
  readonly tools: ReadonlySet<BrowserToolName>;
  readonly repositories: ReadonlySet<string>;
  readonly capabilities: ReadonlySet<AgentCapability>;
  readonly limits: typeof DEFAULT_BROWSER_TOOL_LIMITS;
  readonly allowedExecutables: ReadonlySet<string>;
}

export interface BrowserToolDecision {
  readonly allowed: boolean;
  readonly code: string | null;
  readonly message: string | null;
}

export interface BuildBrowserToolPolicyOptions {
  repositories: Record<string, string>;
  capabilities: readonly AgentCapability[];
  tools?: readonly string[];
}

export interface AuthorizeBrowserToolCallOptions {
  policy: BrowserToolPolicy;
  tool: string;
  repo: string;
  args?: Record<string, unknown>;
}

function deny(code: string, message: string): BrowserToolDecision {
  return Object.freeze({ allowed: false, code, message });
}

function allow(): BrowserToolDecision {
  return Object.freeze({ allowed: true, code: null, message: null });
}

export function browserToolsForCapabilities(
  capabilities: readonly AgentCapability[],
): BrowserToolName[] {
  const tools: BrowserToolName[] = [
    'list_files',
    'read_file',
    'search_text',
    'git_status',
    'git_diff',
    'git_log',
    'git_branch',
  ];

  if (capabilities.includes('workspace:write')) {
    tools.push('apply_patch', 'run_process');
  }

  return tools;
}

export function isMutatingBrowserTool(tool: string): boolean {
  return MUTATING_BROWSER_TOOLS.has(tool as BrowserToolName);
}

export function normalizeBrowserToolPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null;
  if (
    path.isAbsolute(value) ||
    WINDOWS_ABSOLUTE_PATTERN.test(value) ||
    WINDOWS_UNC_PATTERN.test(value)
  ) {
    return null;
  }

  const slashPath = value.replaceAll('\\', '/');
  const parts = slashPath
    .split('/')
    .filter((part) => part !== '' && part !== '.');

  if (parts.some((part) => part === '..')) return null;
  return parts.join('/') || '.';
}

export function isSensitiveBrowserToolPath(value: unknown): boolean {
  const normalized = normalizeBrowserToolPath(value);
  if (!normalized) return true;
  if (normalized === '.') return false;

  const segments = normalized.split('/');
  if (
    segments.some((segment) => segment === '.git' || segment === 'node_modules')
  ) {
    return true;
  }

  const basename = segments.at(-1) ?? '';
  return SENSITIVE_BASENAME_PATTERNS.some((pattern) => pattern.test(basename));
}

function pathCandidates(args: Record<string, unknown>): string[] {
  const values: string[] = [];

  for (const [key, value] of Object.entries(args)) {
    if (!/(?:^|_)(?:path|file|directory|cwd)(?:$|_)/i.test(key)) continue;
    if (typeof value === 'string') values.push(value);
    if (Array.isArray(value)) {
      values.push(
        ...value.filter((entry): entry is string => typeof entry === 'string'),
      );
    }
  }

  return values;
}

function validateProcess(args: Record<string, unknown>): BrowserToolDecision {
  const executable = args.executable;
  const argv = args.argv ?? [];
  const timeoutMs = args.timeoutMs;

  if (
    typeof executable !== 'string' ||
    !ALLOWED_BROWSER_PROCESS_EXECUTABLES.has(executable)
  ) {
    return deny(
      'process-not-allowed',
      'browser process executable is not allowed',
    );
  }

  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== 'string')) {
    return deny('invalid-tool-request', 'browser process argv is invalid');
  }

  if (argv.some((arg) => SHELL_META_PATTERN.test(arg))) {
    return deny(
      'process-not-allowed',
      'browser process argv contains shell metacharacters',
    );
  }

  const forbiddenFlag =
    /^(?:--?(?:prefix|cwd|global|registry|userconfig|config|cache|script-shell|workspace|filter|dir))(?:=|$)|^-(?:C|w)$/i;

  if (
    argv.some((arg) => {
      if (forbiddenFlag.test(arg)) return true;
      const normalized = normalizeBrowserToolPath(arg);
      return (
        normalized === null &&
        (path.isAbsolute(arg) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(arg))
      );
    })
  ) {
    return deny(
      'process-not-allowed',
      'browser process argv can escape the authorized cwd',
    );
  }

  const safeScript =
    /^(?:test|lint|typecheck|check|build)(?::[A-Za-z0-9:_-]+)?$/;

  if (executable === 'node') {
    if (
      argv[0] !== '--test' ||
      argv.some((arg) =>
        [
          '-e',
          '--eval',
          '-p',
          '--print',
          '-r',
          '--require',
          '--import',
        ].includes(arg),
      )
    ) {
      return deny(
        'process-not-allowed',
        'node is allowed only for the built-in test runner',
      );
    }
  } else {
    const [command, script] = argv;
    const safePackageCommand =
      command === 'test' ||
      (command === 'run' &&
        typeof script === 'string' &&
        safeScript.test(script));

    if (!safePackageCommand) {
      return deny(
        'process-not-allowed',
        'package manager command is not allowed',
      );
    }
  }

  if (
    timeoutMs != null &&
    (typeof timeoutMs !== 'number' ||
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > DEFAULT_BROWSER_TOOL_LIMITS.maxProcessTimeoutMs)
  ) {
    return deny('invalid-tool-request', 'browser process timeout is invalid');
  }

  return allow();
}

export function buildBrowserToolPolicy(
  options: BuildBrowserToolPolicyOptions,
): BrowserToolPolicy {
  const aliases = Object.keys(options.repositories).filter(
    (alias) => alias.length > 0,
  );
  const requestedTools =
    options.tools ?? browserToolsForCapabilities(options.capabilities);

  const tools = new Set<BrowserToolName>();
  for (const tool of requestedTools) {
    if (BROWSER_TOOL_NAME_SET.has(tool)) {
      tools.add(tool as BrowserToolName);
    }
  }

  return Object.freeze({
    tools,
    repositories: new Set(aliases),
    capabilities: new Set(options.capabilities),
    limits: DEFAULT_BROWSER_TOOL_LIMITS,
    allowedExecutables: ALLOWED_BROWSER_PROCESS_EXECUTABLES,
  });
}

export function authorizeBrowserToolCall(
  options: AuthorizeBrowserToolCallOptions,
): BrowserToolDecision {
  const { policy, tool, repo } = options;
  const args = options.args ?? {};

  if (!policy.tools.has(tool as BrowserToolName)) {
    return deny('tool-not-allowed', 'browser tool is not allowed');
  }

  if (!policy.repositories.has(repo)) {
    return deny('repo-not-allowed', 'browser repository alias is not allowed');
  }

  if (
    isMutatingBrowserTool(tool) &&
    !policy.capabilities.has('workspace:write')
  ) {
    return deny(
      'authorization-denied',
      'workspace:write capability is required',
    );
  }

  for (const candidate of pathCandidates(args)) {
    if (!normalizeBrowserToolPath(candidate)) {
      return deny('path-forbidden', 'browser tool path is invalid or absolute');
    }
    if (isSensitiveBrowserToolPath(candidate)) {
      return deny('sensitive-path', 'browser tool path is sensitive');
    }
  }

  if (tool === 'run_process') return validateProcess(args);
  return allow();
}
