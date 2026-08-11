import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { AiChatStreamEvent, Project } from '@dev-dashboard/contracts';
import {
  ProjectAiConsentRepository,
  ProjectAiSelectionRepository,
} from '@dev-dashboard/core';
import { LOG_MASK } from '@dev-dashboard/process-manager';

import { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { AiImplementationExecutionService } from '../src/services/ai-implementation-execution-service.js';
import {
  AiProviderResolutionError,
  AiProviderResolver,
} from '../src/services/ai-provider-resolver.js';
import { GitAiCodeReviewService } from '../src/services/git-ai-code-review-service.js';
import { GitService } from '../src/services/git-service.js';
import { OpenAiProvider } from '../src/services/openai-provider.js';
import { ProjectFileService } from '../src/services/project-file-service.js';
import type { GitPullRequestService } from '../src/services/git-pull-request-service.js';

const MODEL = 'gpt-5-mini';
const OPENAI_KEY = 'openai-test-key-that-must-never-enter-content';

interface CapturedRequest {
  url: string;
  method: string;
  body: string;
  authorization: string;
  headers: string;
}

interface OpenAiHarness {
  requests: CapturedRequest[];
  fetchImpl: typeof fetch;
}

function project(root: string, id = 'project-cloud-security'): Project {
  return {
    id,
    name: 'Projeto cloud seguro',
    path: root,
    type: 'node',
    source: 'workspace',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

function localAssistant(): AiAssistantService {
  return {
    status: async () => ({
      available: true,
      models: [
        {
          name: 'qwen2.5-coder:14b',
          capabilities: ['chat', 'tools'] as const,
        },
      ],
      message: 'Provider local disponível.',
    }),
  } as unknown as AiAssistantService;
}

function openAiHarness(
  chatResponses: Array<Record<string, unknown>> = [],
): OpenAiHarness {
  const requests: CapturedRequest[] = [];
  let nextChatResponse = 0;

  const fetchImpl: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const body = request.method === 'GET' ? '' : await request.clone().text();
    requests.push({
      url: request.url,
      method: request.method,
      body,
      authorization: request.headers.get('authorization') ?? '',
      headers: JSON.stringify(Object.fromEntries(request.headers.entries())),
    });

    if (request.url.endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: MODEL }] }), {
        status: 200,
      });
    }

    if (request.url.endsWith('/chat/completions')) {
      const response = chatResponses[nextChatResponse++];
      assert.ok(response, 'faltou uma resposta simulada da OpenAI');
      return new Response(JSON.stringify(response), { status: 200 });
    }

    throw new Error(
      `Request OpenAI inesperado: ${request.method} ${request.url}`,
    );
  };

  return { requests, fetchImpl };
}

function cloudAssistant(harness: OpenAiHarness): AiAssistantService {
  return new AiAssistantService({
    provider: new OpenAiProvider({
      apiKey: OPENAI_KEY,
      fetchImpl: harness.fetchImpl,
    }),
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
  });
}

async function withResolver(
  cloud: AiAssistantService,
  callback: (input: {
    directory: string;
    consent: ProjectAiConsentRepository;
    selection: ProjectAiSelectionRepository;
    resolver: AiProviderResolver;
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-cloud-security-'),
  );
  const consent = new ProjectAiConsentRepository(directory);
  const selection = new ProjectAiSelectionRepository(directory);
  const resolver = new AiProviderResolver({
    ollama: localAssistant(),
    openai: cloud,
    consentRepository: consent,
    selectionRepository: selection,
  });

  try {
    await callback({ directory, consent, selection, resolver });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function waitForImplementation(
  service: AiImplementationExecutionService,
  projectId: string,
  executionId: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (service.find(projectId, executionId)?.status !== 'running') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    'A execução de implementation não terminou dentro do limite.',
  );
}

async function waitForReview(
  service: GitAiCodeReviewService,
  projectId: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (service.latest(projectId)?.status !== 'running') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('A execução de Code Review não terminou dentro do limite.');
}

function chatBodies(harness: OpenAiHarness): string[] {
  return harness.requests
    .filter((request) => request.url.endsWith('/chat/completions'))
    .map((request) => request.body);
}

function assertCredentialOutsideContent(harness: OpenAiHarness): void {
  for (const request of harness.requests) {
    assert.equal(request.body.includes(OPENAI_KEY), false);
    assert.equal(request.headers.includes(OPENAI_KEY), true);
    assert.equal(request.authorization, `Bearer ${OPENAI_KEY}`);
  }
}

test('status OpenAI consulta modelos sem enviar identidade ou conteúdo do projeto', async () => {
  const harness = openAiHarness();
  const cloud = cloudAssistant(harness);

  await withResolver(cloud, async ({ selection, resolver }) => {
    const projectId = 'project-marker-that-must-stay-local';
    await selection.set(projectId, { provider: 'openai', mode: 'complete' });

    const status = await resolver.status(projectId);
    const openai = status.providers.find(
      (provider) => provider.id === 'openai',
    );

    assert.equal(openai?.available, true);
    assert.equal(openai?.consentGranted, false);
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.requests[0]?.method, 'GET');
    assert.match(harness.requests[0]?.url ?? '', /\/v1\/models$/);
    assert.equal(harness.requests[0]?.body, '');
    assert.equal(harness.requests[0]?.url.includes(projectId), false);
    assert.equal(harness.requests[0]?.headers.includes(projectId), false);
    assertCredentialOutsideContent(harness);
  });
});

test('consentimento cloud bloqueia antes de status, lista de arquivos ou conteúdo do projeto', async () => {
  const harness = openAiHarness();
  const cloud = cloudAssistant(harness);

  await withResolver(cloud, async ({ selection, resolver }) => {
    const proj = project('/tmp/project-cloud-consent', 'project-cloud-consent');
    await selection.set(proj.id, { provider: 'openai', mode: 'complete' });
    let reviewFilesCalls = 0;

    const review = new GitAiCodeReviewService(
      localAssistant(),
      {
        getReviewFiles: async () => {
          reviewFilesCalls += 1;
          throw new Error('não deve ler o diff sem consentimento');
        },
        getReviewFileDiff: async () => {
          throw new Error('não deve ler o diff sem consentimento');
        },
      } as unknown as Pick<
        GitPullRequestService,
        'getReviewFiles' | 'getReviewFileDiff'
      >,
      resolver,
    );

    await assert.rejects(
      review.start({
        project: proj,
        targetRemote: 'origin',
        baseBranch: 'main',
        model: MODEL,
      }),
      (error: unknown) =>
        error instanceof AiProviderResolutionError &&
        error.code === 'AI_CLOUD_CONSENT_REQUIRED',
    );

    assert.equal(reviewFilesCalls, 0);
    assert.equal(harness.requests.length, 0);
  });
});

test('chat OpenAI mascara conteúdo antes do request e não expõe credencial em eventos', async () => {
  const secret = 'sk-chat-abcdefghijklmnopqrstuvwxyz123456';
  const harness = openAiHarness([
    {
      choices: [
        { message: { role: 'assistant', content: 'Resposta segura.' } },
      ],
    },
  ]);
  const cloud = cloudAssistant(harness);

  await withResolver(cloud, async ({ consent, selection, resolver }) => {
    const proj = project('/tmp/project-cloud-chat', 'project-cloud-chat');
    await selection.set(proj.id, { provider: 'openai', mode: 'fast' });
    await consent.set(proj.id, 'openai', true);
    const resolved = await resolver.resolveSelected(proj.id, MODEL);
    const events: AiChatStreamEvent[] = [];

    await resolved.assistantService.chat(
      proj,
      MODEL,
      [{ role: 'user', content: `Analise API_KEY=${secret}` }],
      {
        signal: new AbortController().signal,
        send: (event) => events.push(event),
      },
      resolved.mode,
    );

    const bodies = chatBodies(harness);
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0]?.includes(secret), false);
    assert.ok(bodies[0]?.includes(LOG_MASK));
    assertCredentialOutsideContent(harness);
    assert.equal(JSON.stringify(events).includes(OPENAI_KEY), false);
    assert.equal(JSON.stringify(events).includes(secret), false);
  });
});

test('implementation OpenAI mascara prompt e resultado de ferramenta antes da rodada seguinte', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-cloud-implementation-'),
  );
  const promptSecret = 'sk-prompt-abcdefghijklmnopqrstuvwxyz654321';
  const fileSecret = 'sk-file-abcdefghijklmnopqrstuvwxyz987654';
  await writeFile(
    path.join(root, 'config.ts'),
    `export const TOKEN = '${fileSecret}';\n`,
    'utf8',
  );

  try {
    const harness = openAiHarness([
      {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_read_config',
                  type: 'function',
                  function: {
                    name: 'read_project_file',
                    arguments: JSON.stringify({ path: 'config.ts' }),
                  },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            message: { role: 'assistant', content: 'Concluído com segurança.' },
          },
        ],
      },
    ]);
    const cloud = cloudAssistant(harness);

    await withResolver(cloud, async ({ consent, selection, resolver }) => {
      const proj = project(root, 'project-cloud-implementation');
      await selection.set(proj.id, { provider: 'openai', mode: 'complete' });
      await consent.set(proj.id, 'openai', true);
      const implementation = new AiImplementationExecutionService(
        localAssistant(),
        () => new Date(),
        resolver,
      );

      const started = implementation.start(
        proj,
        MODEL,
        `Atualize a integração. API_KEY=${promptSecret}`,
      );
      await waitForImplementation(implementation, proj.id, started.id);

      const completed = implementation.find(proj.id, started.id);
      const bodies = chatBodies(harness);
      assert.equal(completed?.status, 'succeeded');
      assert.equal(completed?.provider, 'openai');
      assert.equal(bodies.length, 2);
      assert.equal(
        bodies.some((body) => body.includes(promptSecret)),
        false,
      );
      assert.equal(
        bodies.some((body) => body.includes(fileSecret)),
        false,
      );
      assert.ok(bodies[0]?.includes(LOG_MASK));
      assert.ok(bodies[1]?.includes(LOG_MASK));
      assertCredentialOutsideContent(harness);
      assert.equal(
        JSON.stringify(completed?.events).includes(OPENAI_KEY),
        false,
      );
      assert.equal(
        JSON.stringify(completed?.events).includes(fileSecret),
        false,
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('completion OpenAI mascara prefixo e sufixo antes da rede', async () => {
  const secret = 'sk-completion-abcdefghijklmnopqrstuvwxyz246810';
  const harness = openAiHarness([
    {
      choices: [{ message: { role: 'assistant', content: 'return value;' } }],
    },
  ]);
  const cloud = cloudAssistant(harness);

  await withResolver(cloud, async ({ consent, selection, resolver }) => {
    const proj = project(
      '/tmp/project-cloud-complete',
      'project-cloud-complete',
    );
    await selection.set(proj.id, { provider: 'openai', mode: 'fast' });
    await consent.set(proj.id, 'openai', true);
    const resolved = await resolver.resolveSelected(proj.id, MODEL);

    const result = await resolved.assistantService.complete(
      MODEL,
      `const token = '${secret}';\nfunction run() {`,
      `}\n// ${secret}`,
      new AbortController().signal,
    );

    assert.equal(result.text, 'return value;');
    const bodies = chatBodies(harness);
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0]?.includes(secret), false);
    assert.ok(bodies[0]?.includes(LOG_MASK));
    assertCredentialOutsideContent(harness);
  });
});

test('Code Review OpenAI mascara diff, síntese global e respeita revogação entre executions', async () => {
  const diffSecret = 'sk-diff-abcdefghijklmnopqrstuvwxyz112233';
  const synthesisSecret = 'sk-summary-abcdefghijklmnopqrstuvwxyz445566';
  const harness = openAiHarness([
    {
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({
              summary: `Resumo ${synthesisSecret}`,
              findings: [],
            }),
          },
        },
      ],
    },
    {
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({
              summary: 'Síntese segura.',
              findings: [],
            }),
          },
        },
      ],
    },
  ]);
  const cloud = cloudAssistant(harness);

  await withResolver(cloud, async ({ consent, selection, resolver }) => {
    const proj = project('/tmp/project-cloud-review', 'project-cloud-review');
    await selection.set(proj.id, { provider: 'openai', mode: 'complete' });
    await consent.set(proj.id, 'openai', true);
    let reviewFilesCalls = 0;
    let reviewDiffCalls = 0;
    const review = new GitAiCodeReviewService(
      localAssistant(),
      {
        getReviewFiles: async () => {
          reviewFilesCalls += 1;
          return {
            targetRemote: 'origin',
            baseBranch: 'main',
            sourceBranch: 'feature/cloud-security',
            files: ['src/config.ts'],
          };
        },
        getReviewFileDiff: async () => {
          reviewDiffCalls += 1;
          return {
            targetRemote: 'origin',
            baseBranch: 'main',
            sourceBranch: 'feature/cloud-security',
            files: ['src/config.ts'],
            diff: `+ export const API_KEY = '${diffSecret}';`,
          };
        },
      } as unknown as Pick<
        GitPullRequestService,
        'getReviewFiles' | 'getReviewFileDiff'
      >,
      resolver,
    );

    await review.start({
      project: proj,
      targetRemote: 'origin',
      baseBranch: 'main',
      model: MODEL,
    });
    await waitForReview(review, proj.id);

    const completed = review.latest(proj.id);
    const bodies = chatBodies(harness);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.provider, 'openai');
    assert.equal(completed?.mode, 'complete');
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0]?.includes(diffSecret), false);
    assert.ok(bodies[0]?.includes(LOG_MASK));
    assert.equal(bodies[1]?.includes(synthesisSecret), false);
    assert.ok(bodies[1]?.includes(LOG_MASK));
    assertCredentialOutsideContent(harness);

    const requestsBeforeRevocation = harness.requests.length;
    const filesBeforeRevocation = reviewFilesCalls;
    const diffsBeforeRevocation = reviewDiffCalls;
    await consent.set(proj.id, 'openai', false);

    await assert.rejects(
      review.start({
        project: proj,
        targetRemote: 'origin',
        baseBranch: 'main',
        model: MODEL,
      }),
      (error: unknown) =>
        error instanceof AiProviderResolutionError &&
        error.code === 'AI_CLOUD_CONSENT_REQUIRED',
    );

    assert.equal(harness.requests.length, requestsBeforeRevocation);
    assert.equal(reviewFilesCalls, filesBeforeRevocation);
    assert.equal(reviewDiffCalls, diffsBeforeRevocation);
  });
});
