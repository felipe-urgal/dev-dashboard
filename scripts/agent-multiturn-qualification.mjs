#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import process from 'node:process';

import {
  isLoopbackUrl,
  readLocalApiToken,
  runAgentQualificationPreflight,
} from './agent-qualification-preflight.mjs';

const DEFAULT_API_URL = 'http://127.0.0.1:4343';
const PROVIDERS = new Set([
  'codex',
  'claude-code',
  'chatgpt-browser',
  'automatic',
]);
const CONCRETE_PROVIDERS = new Set([
  'codex',
  'claude-code',
  'chatgpt-browser',
]);
const AUTOMATIC_PROVIDERS = new Set(['codex', 'claude-code']);

function capture() {
  let content = '';
  return {
    stream: {
      write(value) {
        content += String(value);
      },
    },
    read() {
      return content;
    },
  };
}

function parseArgs(argv) {
  let provider = '';
  let projectId = '';
  let apiUrl = DEFAULT_API_URL;
  let automaticSwitchTo = '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--provider') {
      provider = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--project') {
      projectId = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--api') {
      apiUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--automatic-switch-to') {
      automaticSwitchTo = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(
      'Uso: node scripts/agent-multiturn-qualification.mjs --provider <codex|claude-code|chatgpt-browser|automatic> --project <projectId> [--api http://127.0.0.1:4343] [--automatic-switch-to <codex|claude-code>]',
    );
  }

  if (!PROVIDERS.has(provider)) {
    throw new Error('Provider de qualificação multi-turn inválido.');
  }
  if (!projectId || projectId.length > 256 || projectId.includes('\0')) {
    throw new Error('Project id de qualificação inválido.');
  }
  if (!isLoopbackUrl(apiUrl)) {
    throw new Error('A API de qualificação deve usar HTTP loopback.');
  }
  if (
    automaticSwitchTo &&
    (provider !== 'automatic' || !AUTOMATIC_PROVIDERS.has(automaticSwitchTo))
  ) {
    throw new Error(
      '--automatic-switch-to só pode ser usado com automatic e codex|claude-code.',
    );
  }

  return {
    provider,
    projectId,
    apiUrl: apiUrl.replace(/\/$/, ''),
    ...(automaticSwitchTo ? { automaticSwitchTo } : {}),
  };
}

function taskPath(projectId, taskId = '') {
  const base =
    '/api/projects/' + encodeURIComponent(projectId) + '/agent/tasks';
  return taskId ? base + '/' + encodeURIComponent(taskId) : base;
}

async function requestJson(fetchImpl, apiUrl, token, pathname, init = {}) {
  let response;
  try {
    response = await fetchImpl(apiUrl + pathname, {
      ...init,
      headers: {
        accept: 'application/json',
        'x-dev-dashboard-token': token,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new Error('A API local ficou indisponível durante a qualificação.');
  }

  if (response.status === 401) {
    throw new Error('A autenticação da API local falhou durante a qualificação.');
  }
  if (!response.ok) {
    throw new Error(
      'A API local recusou uma etapa da qualificação (HTTP ' +
        response.status +
        ').',
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error('A API local retornou resposta inválida na qualificação.');
  }
}

function requireSuccessfulExecution(result, requestedProvider, phase) {
  const execution = result?.execution;
  const task = result?.task?.task;
  const providerResult = result?.providerResult;
  if (
    !execution ||
    !task ||
    !providerResult ||
    execution.state !== 'succeeded' ||
    providerResult.outcome !== 'succeeded' ||
    task.state !== 'review' ||
    !CONCRETE_PROVIDERS.has(execution.providerId) ||
    execution.providerId !== providerResult.providerId
  ) {
    throw new Error(
      'A etapa ' + phase + ' não terminou em review com provider concreto.',
    );
  }
  if (
    requestedProvider !== 'automatic' &&
    execution.providerId !== requestedProvider
  ) {
    throw new Error(
      'A etapa ' + phase + ' executou provider concreto diferente do solicitado.',
    );
  }
  return execution;
}

function safePreflightResult(serialized) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('O preflight não retornou evidência estruturada válida.');
  }
  if (!parsed?.ready || typeof parsed.commit !== 'string') {
    throw new Error('O preflight não confirmou readiness do provider real.');
  }
  return parsed;
}

function preferenceBody(providerId) {
  return {
    preferredProviderId: providerId,
    fallbackOrder: [providerId === 'codex' ? 'claude-code' : 'codex'],
  };
}

export async function runAgentMultiTurnQualification(
  argv,
  {
    fetchImpl = fetch,
    readToken = readLocalApiToken,
    runPreflight = runAgentQualificationPreflight,
    createMarker = () => randomBytes(12).toString('hex'),
    stdout = process.stdout,
    stderr = process.stderr,
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

  const preflightStdout = capture();
  const preflightStderr = capture();
  const preflightCode = await runPreflight(
    [
      '--provider',
      options.provider,
      '--api',
      options.apiUrl,
    ],
    {
      stdout: preflightStdout.stream,
      stderr: preflightStderr.stream,
    },
  );
  if (preflightCode !== 0) {
    const message = preflightStderr.read().trim();
    stderr.write(
      (message || 'Preflight do provider real não ficou pronto.') + '\n',
    );
    return 1;
  }

  let preflight;
  try {
    preflight = safePreflightResult(preflightStdout.read());
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : 'Preflight inválido.'}\n`,
    );
    return 1;
  }

  let token;
  try {
    token = await readToken();
  } catch {
    stderr.write(
      'Não foi possível ler o token local do Dev Dashboard para a qualificação.\n',
    );
    return 1;
  }

  const marker = 'dd-multiturn-' + createMarker();
  const turnOneId = 'qualification-turn-1-' + createMarker();
  const turnTwoId = 'qualification-turn-2-' + createMarker();
  let previousPreference;
  let preferenceChanged = false;
  let preferenceRestored = false;

  try {
    if (options.automaticSwitchTo) {
      const providerPayload = await requestJson(
        fetchImpl,
        options.apiUrl,
        token,
        '/api/agent/providers',
      );
      const switchStatus = Array.isArray(providerPayload?.providers)
        ? providerPayload.providers.find(
            (item) => item?.providerId === options.automaticSwitchTo,
          )
        : undefined;
      if (switchStatus?.availability !== 'available') {
        throw new Error(
          'O provider alvo do switch automático não está disponível.',
        );
      }

      const preferencePayload = await requestJson(
        fetchImpl,
        options.apiUrl,
        token,
        '/api/projects/' +
          encodeURIComponent(options.projectId) +
          '/agent/provider-preference',
      );
      previousPreference = preferencePayload?.preference ?? null;
    }

    const created = await requestJson(
      fetchImpl,
      options.apiUrl,
      token,
      taskPath(options.projectId),
      {
        method: 'POST',
        body: JSON.stringify({
          summary:
            'Qualificação multi-turn read-only. Não modifique arquivos nem execute comandos mutáveis. Responda apenas com uma confirmação curta.',
          requestedCapabilities: [],
        }),
      },
    );
    const taskId = created?.task?.task?.id;
    const environmentInstanceId = created?.task?.task?.environmentInstanceId;
    if (!taskId || created?.task?.task?.state !== 'queued') {
      throw new Error('A task de qualificação não foi criada em queued.');
    }

    const bootstrap = await requestJson(
      fetchImpl,
      options.apiUrl,
      token,
      taskPath(options.projectId, taskId) + '/executions',
      {
        method: 'POST',
        body: JSON.stringify({ providerId: options.provider }),
      },
    );
    const bootstrapExecution = requireSuccessfulExecution(
      bootstrap,
      options.provider,
      'bootstrap',
    );

    const turnOne = await requestJson(
      fetchImpl,
      options.apiUrl,
      token,
      taskPath(options.projectId, taskId) + '/turns',
      {
        method: 'POST',
        body: JSON.stringify({
          id: turnOneId,
          providerId: options.provider,
          content:
            'Turno 1 da qualificação. Memorize exatamente o marcador ' +
            marker +
            '. Não modifique arquivos. Confirme que memorizou o marcador.',
        }),
      },
    );
    const turnOneExecution = requireSuccessfulExecution(
      turnOne,
      options.provider,
      'turn-1',
    );
    if (
      turnOne?.userTurn?.id !== turnOneId ||
      turnOne?.agentTurn?.executionId !== turnOneExecution.id
    ) {
      throw new Error('O primeiro turno não foi persistido corretamente.');
    }

    if (options.automaticSwitchTo) {
      if (turnOneExecution.providerId === options.automaticSwitchTo) {
        throw new Error(
          'O provider alvo do switch já foi usado no primeiro turno; o gate não comprovaria troca concreta.',
        );
      }
      await requestJson(
        fetchImpl,
        options.apiUrl,
        token,
        '/api/projects/' +
          encodeURIComponent(options.projectId) +
          '/agent/provider-preference',
        {
          method: 'PUT',
          body: JSON.stringify(preferenceBody(options.automaticSwitchTo)),
        },
      );
      preferenceChanged = true;
    }

    const turnTwo = await requestJson(
      fetchImpl,
      options.apiUrl,
      token,
      taskPath(options.projectId, taskId) + '/turns',
      {
        method: 'POST',
        body: JSON.stringify({
          id: turnTwoId,
          providerId: options.provider,
          content:
            'Turno 2 da qualificação. Sem inventar um novo marcador e sem modificar arquivos, responda incluindo exatamente o marcador que foi fornecido no turno anterior.',
        }),
      },
    );
    const turnTwoExecution = requireSuccessfulExecution(
      turnTwo,
      options.provider,
      'turn-2',
    );
    if (
      turnTwo?.userTurn?.id !== turnTwoId ||
      turnTwo?.agentTurn?.executionId !== turnTwoExecution.id
    ) {
      throw new Error('O segundo turno não foi persistido corretamente.');
    }
    if (!String(turnTwo?.agentTurn?.content ?? '').includes(marker)) {
      throw new Error(
        'O segundo turno não recuperou o marcador do contexto persistido.',
      );
    }
    if (
      options.automaticSwitchTo &&
      turnTwoExecution.providerId !== options.automaticSwitchTo
    ) {
      throw new Error(
        'Automatic não executou o segundo turno no provider alvo do switch.',
      );
    }

    const conversationPayload = await requestJson(
      fetchImpl,
      options.apiUrl,
      token,
      taskPath(options.projectId, taskId) + '/conversation',
    );
    const turns = Array.isArray(conversationPayload?.turns)
      ? conversationPayload.turns
      : [];
    const persistedTurnOne = turns.find((turn) => turn?.id === turnOneId);
    const persistedTurnTwo = turns.find((turn) => turn?.id === turnTwoId);
    if (
      persistedTurnOne?.role !== 'user' ||
      persistedTurnTwo?.role !== 'user' ||
      turns.filter((turn) => turn?.taskId === taskId).length < 4
    ) {
      throw new Error(
        'A conversa persistida não contém os dois turnos e respostas esperados.',
      );
    }

    stdout.write(
      JSON.stringify(
        {
          version: 1,
          commit: preflight.commit,
          provider: options.provider,
          projectId: options.projectId,
          taskId,
          environmentInstanceId,
          requestedCapabilities: [],
          executions: [
            {
              phase: 'bootstrap',
              executionId: bootstrapExecution.id,
              providerId: bootstrapExecution.providerId,
            },
            {
              phase: 'turn-1',
              executionId: turnOneExecution.id,
              providerId: turnOneExecution.providerId,
            },
            {
              phase: 'turn-2',
              executionId: turnTwoExecution.id,
              providerId: turnTwoExecution.providerId,
            },
          ],
          conversationTurns: turns.filter((turn) => turn?.taskId === taskId)
            .length,
          markerRecovered: true,
          ...(options.automaticSwitchTo
            ? {
                automaticProviderSwitch: {
                  from: turnOneExecution.providerId,
                  to: turnTwoExecution.providerId,
                },
              }
            : {}),
          ready: true,
        },
        null,
        2,
      ) + '\n',
    );
    return 0;
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : 'Qualificação multi-turn falhou.'}\n`,
    );
    return 1;
  } finally {
    if (preferenceChanged) {
      try {
        const pathname =
          '/api/projects/' +
          encodeURIComponent(options.projectId) +
          '/agent/provider-preference';
        if (previousPreference) {
          await requestJson(fetchImpl, options.apiUrl, token, pathname, {
            method: 'PUT',
            body: JSON.stringify({
              preferredProviderId: previousPreference.preferredProviderId,
              fallbackOrder: previousPreference.fallbackOrder,
            }),
          });
        } else {
          let response;
          try {
            response = await fetchImpl(options.apiUrl + pathname, {
              method: 'DELETE',
              headers: {
                accept: 'application/json',
                'x-dev-dashboard-token': token,
              },
            });
          } catch {
            response = null;
          }
          if (!response?.ok) {
            throw new Error(
              'Não foi possível restaurar a preferência de provider após a qualificação.',
            );
          }
        }
        preferenceRestored = true;
      } catch {
        if (!preferenceRestored) {
          stderr.write(
            'A preferência de provider foi alterada pelo gate e não pôde ser restaurada automaticamente.\n',
          );
        }
      }
    }
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;

if (invokedDirectly) {
  process.exitCode = await runAgentMultiTurnQualification(
    process.argv.slice(2),
  );
}
