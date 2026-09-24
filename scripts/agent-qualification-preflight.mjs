#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const DEFAULT_API_URL = 'http://127.0.0.1:4343';
const PROVIDERS = new Set([
  'codex',
  'claude-code',
  'chatgpt-browser',
  'automatic',
]);

function lastNonEmptyLine(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

function isLoopbackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '[::1]')
  );
}

function parseArgs(argv) {
  let provider = '';
  let apiUrl = DEFAULT_API_URL;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--provider') {
      provider = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--api') {
      apiUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(
      'Uso: node scripts/agent-qualification-preflight.mjs --provider <codex|claude-code|chatgpt-browser|automatic> [--api http://127.0.0.1:4343]',
    );
  }

  if (!PROVIDERS.has(provider)) {
    throw new Error('Provider de qualificação inválido.');
  }
  if (!isLoopbackUrl(apiUrl)) {
    throw new Error('A API de qualificação deve usar HTTP loopback.');
  }

  return { provider, apiUrl: apiUrl.replace(/\/$/, '') };
}

function runCommand(runner, command, args, cwd) {
  return runner(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout: 5_000,
    maxBuffer: 64 * 1024,
  });
}

function inspectGit(runner, cwd) {
  const commit = runCommand(runner, 'git', ['rev-parse', 'HEAD'], cwd);
  if (commit.error || commit.status !== 0) {
    throw new Error('Não foi possível identificar o commit atual.');
  }

  const status = runCommand(
    runner,
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    cwd,
  );
  if (status.error || status.status !== 0) {
    throw new Error('Não foi possível verificar o estado do repositório.');
  }

  return {
    commit: lastNonEmptyLine(commit.stdout) ?? '',
    dirty: Boolean(String(status.stdout ?? '').trim()),
  };
}

function inspectCli(runner, provider, cwd) {
  const command =
    provider === 'codex' ? 'codex' : provider === 'claude-code' ? 'claude' : '';
  if (!command) return null;

  const result = runCommand(runner, command, ['--version'], cwd);
  if (result.error || result.status !== 0) {
    return { available: false };
  }

  return {
    available: true,
    version: lastNonEmptyLine(result.stdout) ?? lastNonEmptyLine(result.stderr),
  };
}

async function fetchProviderStatus(fetchImpl, apiUrl, provider) {
  let response;
  try {
    response = await fetchImpl(apiUrl + '/api/agent/providers', {
      headers: { accept: 'application/json' },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let payload;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const providers = Array.isArray(payload?.providers) ? payload.providers : [];
  const item = providers.find((candidate) => candidate?.providerId === provider);
  if (!item || typeof item !== 'object') return null;

  return {
    providerId: provider,
    availability:
      item.availability === 'available' ||
      item.availability === 'degraded' ||
      item.availability === 'unavailable'
        ? item.availability
        : 'unavailable',
    ...(typeof item.version === 'string' ? { version: item.version } : {}),
    ...(typeof item.observedAt === 'string'
      ? { observedAt: item.observedAt }
      : {}),
  };
}

export async function runAgentQualificationPreflight(
  argv,
  {
    runner = spawnSync,
    fetchImpl = fetch,
    stdout = process.stdout,
    stderr = process.stderr,
    cwd = process.cwd(),
  } = {},
) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : 'Argumentos inválidos.'}\n`,
    );
    return 2;
  }

  let git;
  try {
    git = inspectGit(runner, cwd);
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : 'Preflight Git inválido.'}\n`,
    );
    return 1;
  }

  const cli = inspectCli(runner, options.provider, cwd);
  const providerStatus = await fetchProviderStatus(
    fetchImpl,
    options.apiUrl,
    options.provider,
  );

  const ready =
    providerStatus?.availability === 'available' &&
    (cli === null || cli.available === true);

  stdout.write(
    JSON.stringify(
      {
        version: 1,
        commit: git.commit,
        dirty: git.dirty,
        provider: options.provider,
        api: 'loopback',
        ...(cli ? { cli } : {}),
        status: providerStatus ?? {
          providerId: options.provider,
          availability: 'unavailable',
        },
        ready,
      },
      null,
      2,
    ) + '\n',
  );

  if (!ready) {
    stderr.write(
      'Provider não está pronto para o gate real; nenhum teste de paridade foi declarado.\n',
    );
    return 1;
  }

  return 0;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;

if (invokedDirectly) {
  process.exitCode = await runAgentQualificationPreflight(
    process.argv.slice(2),
  );
}
