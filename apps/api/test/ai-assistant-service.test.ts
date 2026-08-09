import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import type {
  AiChatMessage,
  AiChatStreamEvent,
  Project,
} from '@dev-dashboard/contracts';
import type { ProjectLanguageServerService } from '../src/services/project-language-server-service.js';

import {
  AiAssistantService,
  resolveOllamaBaseUrl,
} from '../src/services/ai-assistant-service.js';
import { GitService } from '../src/services/git-service.js';
import { ProjectFileService } from '../src/services/project-file-service.js';
import { ProjectWorkspaceEditService } from '../src/services/project-workspace-edit-service.js';

function fakeLanguageServerService(
  requestSymbolLocations: ProjectLanguageServerService['requestSymbolLocations'],
): ProjectLanguageServerService {
  return { requestSymbolLocations } as unknown as ProjectLanguageServerService;
}

const execFileAsync = promisify(execFile);

function project(root: string): Project {
  return {
    id: 'project-1',
    name: 'Painel',
    path: root,
    type: 'node',
    source: 'workspace',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

function ndjsonResponse(chunks: unknown[], status = 200): Response {
  const body = chunks.map((chunk) => JSON.stringify(chunk)).join('\n');
  return new Response(body, { status });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

async function collect(
  service: AiAssistantService,
  proj: Project,
  model: string,
  messages: AiChatMessage[],
  signal: AbortSignal = new AbortController().signal,
): Promise<AiChatStreamEvent[]> {
  const events: AiChatStreamEvent[] = [];
  await service.chat(proj, model, messages, {
    send: (event) => events.push(event),
    signal,
  });
  return events;
}

test('status() informa indisponibilidade sem instalar nada quando o Ollama não responde', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () => {
      throw new Error('conexão recusada');
    },
  });
  const status = await service.status();
  assert.equal(status.available, false);
  assert.deepEqual(status.models, []);
  assert.match(status.message, /não foi detectado/);
});

test('status() lista modelos instalados e capacidades sem baixar nada', async () => {
  const calls: string[] = [];
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/api/tags')) {
        return jsonResponse({
          models: [{ name: 'qwen2.5-coder:7b' }, { name: 'llama3.1:8b' }],
        });
      }
      if (url.endsWith('/api/show')) {
        return jsonResponse({ capabilities: ['completion', 'tools'] });
      }
      throw new Error(`chamada inesperada: ${url}`);
    },
  });
  const status = await service.status();
  assert.equal(status.available, true);
  assert.deepEqual(status.models, [
    { name: 'qwen2.5-coder:7b', capabilities: ['chat', 'tools'] },
    { name: 'llama3.1:8b', capabilities: ['chat', 'tools'] },
  ]);
  assert.ok(calls.every((url) => url.startsWith('http://127.0.0.1:11434')));
});

test('chat() recusa conversas vazias ou fora dos limites sem chamar o Ollama', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () => {
      throw new Error('não deveria chamar o Ollama');
    },
  });
  const events = await collect(
    service,
    project('/tmp/inexistente'),
    'llama3.1',
    [],
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'error');
});

test('chat() transmite deltas de mensagem e sinaliza o fim da resposta', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () =>
      ndjsonResponse([
        { message: { role: 'assistant', content: 'Olá' }, done: false },
        { message: { role: 'assistant', content: ' mundo' }, done: false },
        { message: { role: 'assistant', content: '' }, done: true },
      ]),
  });
  const events = await collect(
    service,
    project('/tmp/inexistente'),
    'llama3.1',
    [{ role: 'user', content: 'Oi' }],
  );
  assert.deepEqual(
    events
      .filter((event) => event.type === 'message-delta')
      .map((event) => (event as { content: string }).content),
    ['Olá', ' mundo'],
  );
  assert.equal(events.at(-1)?.type, 'done');
});

test('review() envia contexto fechado ao Ollama sem ferramentas', async () => {
  let requestBody: Record<string, unknown> | null = null;
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return ndjsonResponse([
        {
          message: {
            role: 'assistant',
            content: '{"summary":"Sem achados","findings":[]}',
          },
          done: true,
        },
      ]);
    },
  });

  const response = await service.review(
    'llama3.1',
    [
      { role: 'system', content: 'Revise somente o diff.' },
      { role: 'user', content: 'DIFF: + const ok = true;' },
    ],
    new AbortController().signal,
  );

  assert.equal(response, '{"summary":"Sem achados","findings":[]}');
  assert.ok(requestBody);
  assert.equal('tools' in requestBody, false);
});

test('pullRecommendedModel() transmite o progresso de um modelo permitido', async () => {
  let requestBody: Record<string, unknown> | null = null;
  const events: Array<Record<string, unknown>> = [];
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return ndjsonResponse([
        { status: 'pulling manifest' },
        { status: 'downloading', total: 100, completed: 40 },
        { status: 'success', total: 100, completed: 100 },
      ]);
    },
  });

  await service.pullRecommendedModel('qwen2.5-coder:7b', {
    signal: new AbortController().signal,
    send: (event) => events.push(event),
  });

  assert.deepEqual(requestBody, { name: 'qwen2.5-coder:7b', stream: true });
  assert.deepEqual(events.at(-1), {
    type: 'done',
    model: 'qwen2.5-coder:7b',
  });
  assert.deepEqual(events[1], {
    type: 'progress',
    model: 'qwen2.5-coder:7b',
    status: 'downloading',
    total: 100,
    completed: 40,
  });
});

test('chat() executa read_project_file do catálogo fechado e devolve o resultado ao modelo', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-ai-tool-'));
  await writeFile(path.join(root, 'README.md'), '# Painel\n', 'utf8');
  try {
    let round = 0;
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () => {
        round += 1;
        if (round === 1) {
          return ndjsonResponse([
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'read_project_file',
                      arguments: { path: 'README.md' },
                    },
                  },
                ],
              },
              done: true,
            },
          ]);
        }
        return ndjsonResponse([
          {
            message: { role: 'assistant', content: 'O README diz olá.' },
            done: true,
          },
        ]);
      },
    });
    const events = await collect(service, project(root), 'llama3.1', [
      { role: 'user', content: 'O que tem no README?' },
    ]);
    const toolCall = events.find((event) => event.type === 'tool-call');
    const toolResult = events.find((event) => event.type === 'tool-result');
    assert.ok(
      toolCall &&
        toolCall.type === 'tool-call' &&
        toolCall.tool === 'read_project_file',
    );
    assert.ok(
      toolResult && toolResult.type === 'tool-result' && toolResult.ok === true,
    );
    assert.equal(round, 2);
    assert.equal(events.at(-1)?.type, 'done');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat() recusa ferramenta fora do catálogo fechado sem executar nada', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () =>
      ndjsonResponse([
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'run_shell_command',
                  arguments: { command: 'rm -rf /' },
                },
              },
            ],
          },
          done: true,
        },
      ]),
  });
  const events = await collect(
    service,
    project('/tmp/inexistente'),
    'llama3.1',
    [{ role: 'user', content: 'Apague tudo' }],
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'error');
  assert.match(
    (events[0] as { message: string }).message,
    /catálogo autorizado/,
  );
});

test('chat() lista arquivos e busca texto restritos ao projeto atual', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-search-'),
  );
  await writeFile(path.join(root, 'a.txt'), 'conteudo alfa\n', 'utf8');
  await writeFile(path.join(root, 'b.txt'), 'conteudo beta\n', 'utf8');
  try {
    const fileService = new ProjectFileService();
    let round = 0;
    const service = new AiAssistantService({
      projectFileService: fileService,
      gitService: new GitService(),
      fetchImpl: async () => {
        round += 1;
        if (round === 1) {
          return ndjsonResponse([
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  { function: { name: 'list_project_files', arguments: {} } },
                  {
                    function: {
                      name: 'search_project_text',
                      arguments: { query: 'alfa' },
                    },
                  },
                ],
              },
              done: true,
            },
          ]);
        }
        return ndjsonResponse([
          {
            message: { role: 'assistant', content: 'Encontrei alfa.' },
            done: true,
          },
        ]);
      },
    });
    const events = await collect(service, project(root), 'llama3.1', [
      { role: 'user', content: 'Onde está "alfa"?' },
    ]);
    const results = events.filter((event) => event.type === 'tool-result');
    assert.equal(results.length, 2);
    assert.ok(
      results.every((event) => event.type === 'tool-result' && event.ok),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat() obtém diff Git de um arquivo do projeto', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-ai-diff-'));
  try {
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'Dashboard Test'], {
      cwd: root,
    });
    await execFileAsync(
      'git',
      ['config', 'user.email', 'dashboard@example.test'],
      { cwd: root },
    );
    await writeFile(path.join(root, 'app.rb'), 'puts 1\n', 'utf8');
    await execFileAsync('git', ['add', 'app.rb'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'inicial'], { cwd: root });
    await writeFile(path.join(root, 'app.rb'), 'puts 2\n', 'utf8');

    let round = 0;
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () => {
        round += 1;
        if (round === 1) {
          return ndjsonResponse([
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'get_git_diff',
                      arguments: { path: 'app.rb' },
                    },
                  },
                ],
              },
              done: true,
            },
          ]);
        }
        return ndjsonResponse([
          {
            message: {
              role: 'assistant',
              content: 'O diff muda puts 1 para puts 2.',
            },
            done: true,
          },
        ]);
      },
    });
    const events = await collect(service, project(root), 'llama3.1', [
      { role: 'user', content: 'O que mudou em app.rb?' },
    ]);
    const toolResult = events.find((event) => event.type === 'tool-result');
    assert.ok(
      toolResult && toolResult.type === 'tool-result' && toolResult.ok === true,
    );
    assert.equal(events.at(-1)?.type, 'done');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat() propõe uma edição de workspace e emite um preview aguardando confirmação', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-ai-edit-'));
  await writeFile(path.join(root, 'app.rb'), 'old text\n', 'utf8');
  try {
    let round = 0;
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () => {
        round += 1;
        if (round === 1) {
          return ndjsonResponse([
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'propose_workspace_edit',
                      arguments: {
                        files: [
                          {
                            path: 'app.rb',
                            edits: [
                              {
                                range: {
                                  start: { line: 1, column: 1 },
                                  end: { line: 1, column: 9 },
                                },
                                newText: 'new text',
                              },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
              },
              done: true,
            },
          ]);
        }
        return ndjsonResponse([
          {
            message: { role: 'assistant', content: 'Propus a edição.' },
            done: true,
          },
        ]);
      },
    });
    const events = await collect(service, project(root), 'llama3.1', [
      { role: 'user', content: 'Corrija o texto de app.rb.' },
    ]);
    const proposed = events.find(
      (event) => event.type === 'workspace-edit-proposed',
    );
    assert.ok(proposed && proposed.type === 'workspace-edit-proposed');
    assert.equal(proposed.preview.files.length, 1);
    assert.equal(proposed.preview.files[0]?.path, 'app.rb');
    assert.equal(proposed.preview.files[0]?.afterContent, 'new text\n');
    assert.ok(proposed.preview.confirmationToken.length > 0);

    const toolResult = events.find((event) => event.type === 'tool-result');
    assert.ok(
      toolResult && toolResult.type === 'tool-result' && toolResult.ok === true,
    );
    assert.equal(events.at(-1)?.type, 'done');

    // Nada foi escrito em disco: só o preview foi gerado, aplicar exige o
    // fluxo HTTP separado (POST /workspace-edits/apply) com o token acima.
    const fileService = new ProjectFileService();
    const onDisk = await fileService.readFile(root, 'app.rb');
    assert.equal(onDisk.content, 'old text\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat() ignora expectedVersion vindo do modelo e sempre lê a versão atual do servidor', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-edit-version-'),
  );
  await writeFile(path.join(root, 'app.rb'), 'old text\n', 'utf8');
  try {
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () =>
        ndjsonResponse([
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  function: {
                    name: 'propose_workspace_edit',
                    arguments: {
                      files: [
                        {
                          path: 'app.rb',
                          // Um modelo mal-intencionado ou confuso poderia tentar enviar uma versão
                          // "de outro momento" — este campo não faz parte do schema da ferramenta e
                          // deve ser ignorado; o servidor sempre relê a versão atual do disco.
                          expectedVersion: 'f'.repeat(64),
                          edits: [
                            {
                              range: {
                                start: { line: 1, column: 1 },
                                end: { line: 1, column: 9 },
                              },
                              newText: 'new text',
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              ],
            },
            done: true,
          },
        ]),
    });
    const events = await collect(service, project(root), 'llama3.1', [
      { role: 'user', content: 'Corrija app.rb.' },
    ]);
    const proposed = events.find(
      (event) => event.type === 'workspace-edit-proposed',
    );
    assert.ok(proposed && proposed.type === 'workspace-edit-proposed');
    assert.equal(proposed.preview.files[0]?.afterContent, 'new text\n');
    const toolResult = events.find((event) => event.type === 'tool-result');
    assert.ok(
      toolResult && toolResult.type === 'tool-result' && toolResult.ok === true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat() recusa propose_workspace_edit sem edições e não gera preview', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-edit-invalid-'),
  );
  await writeFile(path.join(root, 'app.rb'), 'old text\n', 'utf8');
  try {
    let round = 0;
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () => {
        round += 1;
        if (round === 1) {
          return ndjsonResponse([
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'propose_workspace_edit',
                      arguments: { files: [{ path: 'app.rb', edits: [] }] },
                    },
                  },
                ],
              },
              done: true,
            },
          ]);
        }
        return ndjsonResponse([
          {
            message: {
              role: 'assistant',
              content: 'Não consegui propor a edição.',
            },
            done: true,
          },
        ]);
      },
    });
    const events = await collect(service, project(root), 'llama3.1', [
      { role: 'user', content: 'Corrija app.rb.' },
    ]);
    assert.equal(
      events.some((event) => event.type === 'workspace-edit-proposed'),
      false,
    );
    const toolResult = events.find((event) => event.type === 'tool-result');
    assert.ok(
      toolResult &&
        toolResult.type === 'tool-result' &&
        toolResult.ok === false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat() não emite eventos quando o sinal já está abortado', async () => {
  const controller = new AbortController();
  controller.abort();
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () => {
      throw new Error('não deveria chamar o Ollama após abort');
    },
  });
  const events = await collect(
    service,
    project('/tmp/inexistente'),
    'llama3.1',
    [{ role: 'user', content: 'Oi' }],
    controller.signal,
  );
  assert.deepEqual(events, []);
});

test('resolveOllamaBaseUrl() aceita loopback IPv4/IPv6 e recusa hosts remotos', () => {
  const previous = process.env.DEV_DASHBOARD_OLLAMA_URL;
  try {
    delete process.env.DEV_DASHBOARD_OLLAMA_URL;
    assert.equal(resolveOllamaBaseUrl(), 'http://127.0.0.1:11434');

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'http://127.0.0.1:9999';
    assert.equal(resolveOllamaBaseUrl(), 'http://127.0.0.1:9999');

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'http://[::1]:11434';
    assert.equal(resolveOllamaBaseUrl(), 'http://[::1]:11434');

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'http://localhost:11434';
    assert.equal(resolveOllamaBaseUrl(), 'http://localhost:11434');

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'http://example.com:11434';
    assert.equal(resolveOllamaBaseUrl(), undefined);

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'https://127.0.0.1:11434';
    assert.equal(resolveOllamaBaseUrl(), undefined);

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'não é uma url';
    assert.equal(resolveOllamaBaseUrl(), undefined);
  } finally {
    if (previous === undefined) delete process.env.DEV_DASHBOARD_OLLAMA_URL;
    else process.env.DEV_DASHBOARD_OLLAMA_URL = previous;
  }
});

test('chat() emite um erro claro quando o Ollama envia NDJSON malformado', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () =>
      new Response('{ isto não é json válido', { status: 200 }),
  });
  const events = await collect(
    service,
    project('/tmp/inexistente'),
    'llama3.1',
    [{ role: 'user', content: 'Oi' }],
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'error');
  assert.match(
    (events[0] as { message: string }).message,
    /não pôde ser interpretad/,
  );
});

test('chat() traduz o timeout interno da rodada num erro claro em vez do texto nativo do AbortController', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () => {
      // Simula o que o `fetch` nativo lança quando o `timeoutController` interno
      // (não o cancelamento do usuário) aborta a requisição por estourar o
      // tempo limite da rodada.
      throw new DOMException('This operation was aborted', 'AbortError');
    },
  });
  const events = await collect(
    service,
    project('/tmp/inexistente'),
    'llama3.1',
    [{ role: 'user', content: 'Oi' }],
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'error');
  const message = (events[0] as { message: string }).message;
  assert.match(message, /não respondeu em \d+ segundos/);
  assert.doesNotMatch(message, /This operation was aborted/);
});

test('status() reporta fill-in-the-middle quando o Ollama anuncia a capacidade insert', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'qwen2.5-coder' }] }),
        );
      }
      if (url.endsWith('/api/show')) {
        return new Response(
          JSON.stringify({ capabilities: ['completion', 'insert'] }),
        );
      }
      throw new Error(`chamada inesperada: ${url}`);
    },
  });
  const status = await service.status();
  assert.deepEqual(status.models, [
    { name: 'qwen2.5-coder', capabilities: ['chat', 'fill-in-the-middle'] },
  ]);
});

test('complete() não chama o Ollama quando prefixo e sufixo estão vazios', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () => {
      throw new Error('não deveria chamar o Ollama');
    },
  });
  const result = await service.complete(
    'llama3.1',
    '',
    '',
    new AbortController().signal,
  );
  assert.deepEqual(result, { text: '' });
});

test('complete() recusa modelo vazio e contexto acima do limite sem chamar o Ollama', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () => {
      throw new Error('não deveria chamar o Ollama');
    },
  });
  await assert.rejects(
    () =>
      service.complete('', 'const x = 1;', '', new AbortController().signal),
    /Selecione um modelo/,
  );
  await assert.rejects(
    () =>
      service.complete(
        'llama3.1',
        'a'.repeat(5_000),
        '',
        new AbortController().signal,
      ),
    /excede o limite/,
  );
});

test('complete() envia suffix apenas quando presente e devolve o texto truncado', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async (_input, init) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ response: 'return a + b;' }));
    },
  });

  const withoutSuffix = await service.complete(
    'llama3.1',
    'function sum(a, b) {\n',
    '',
    new AbortController().signal,
  );
  assert.equal(withoutSuffix.text, 'return a + b;');
  assert.equal('suffix' in calls[0]!, false);

  await service.complete(
    'llama3.1',
    'function sum(a, b) {\n',
    '\n}',
    new AbortController().signal,
  );
  assert.equal(calls[1]?.suffix, '\n}');
});

test('complete() propaga falha do Ollama como erro claro', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () => new Response('erro interno', { status: 500 }),
  });
  await assert.rejects(
    () =>
      service.complete(
        'llama3.1',
        'const x = ',
        '',
        new AbortController().signal,
      ),
    /status 500/,
  );
});

test('chat() consulta a definição de um símbolo via LSP e devolve os locais ao modelo', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-symbol-def-'),
  );
  try {
    let round = 0;
    const languageServerService = fakeLanguageServerService(
      async (project, kind, filePath, position, method) => {
        assert.equal(kind, 'ruby');
        assert.equal(filePath, 'app.rb');
        assert.deepEqual(position, { line: 3, column: 5 });
        assert.equal(method, 'textDocument/definition');
        return [
          {
            path: 'app/models/user.rb',
            range: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 10 },
            },
          },
        ];
      },
    );
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () => {
        round += 1;
        if (round === 1) {
          return ndjsonResponse([
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'get_symbol_definition',
                      arguments: { path: 'app.rb', line: 3, column: 5 },
                    },
                  },
                ],
              },
              done: true,
            },
          ]);
        }
        return ndjsonResponse([
          {
            message: { role: 'assistant', content: 'Definido em user.rb.' },
            done: true,
          },
        ]);
      },
      workspaceEditService: new ProjectWorkspaceEditService(
        new ProjectFileService(),
      ),
      languageServerService: languageServerService,
    });
    const events = await collect(service, project(root), 'llama3.1', [
      { role: 'user', content: 'Onde isso é definido?' },
    ]);
    const toolResult = events.find((event) => event.type === 'tool-result');
    assert.ok(
      toolResult && toolResult.type === 'tool-result' && toolResult.ok === true,
    );
    assert.equal(events.at(-1)?.type, 'done');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat() consulta referências de um símbolo e informa quando o LSP não está disponível', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-symbol-refs-'),
  );
  try {
    const languageServerService = fakeLanguageServerService(
      async () => undefined,
    );
    let round = 0;
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () => {
        round += 1;
        if (round === 1) {
          return ndjsonResponse([
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'get_symbol_references',
                      arguments: { path: 'app.js', line: 1, column: 1 },
                    },
                  },
                ],
              },
              done: true,
            },
          ]);
        }
        return ndjsonResponse([
          {
            message: { role: 'assistant', content: 'Não há LSP disponível.' },
            done: true,
          },
        ]);
      },
      workspaceEditService: new ProjectWorkspaceEditService(
        new ProjectFileService(),
      ),
      languageServerService: languageServerService,
    });
    const events = await collect(service, project(root), 'llama3.1', [
      { role: 'user', content: 'Onde isso é usado?' },
    ]);
    const toolResult = events.find((event) => event.type === 'tool-result');
    assert.ok(
      toolResult && toolResult.type === 'tool-result' && toolResult.ok === true,
    );
    assert.equal(events.at(-1)?.type, 'done');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat() recusa get_symbol_definition para extensão sem servidor de linguagem reconhecido', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-symbol-unknown-'),
  );
  try {
    let calledLanguageServer = false;
    const languageServerService = fakeLanguageServerService(async () => {
      calledLanguageServer = true;
      return [];
    });
    let round = 0;
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () => {
        round += 1;
        if (round === 1) {
          return ndjsonResponse([
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'get_symbol_definition',
                      arguments: { path: 'README.md', line: 1, column: 1 },
                    },
                  },
                ],
              },
              done: true,
            },
          ]);
        }
        return ndjsonResponse([
          {
            message: {
              role: 'assistant',
              content: 'Sem suporte para este arquivo.',
            },
            done: true,
          },
        ]);
      },
      workspaceEditService: new ProjectWorkspaceEditService(
        new ProjectFileService(),
      ),
      languageServerService: languageServerService,
    });
    const events = await collect(service, project(root), 'llama3.1', [
      { role: 'user', content: 'Onde isso é definido?' },
    ]);
    assert.equal(calledLanguageServer, false);
    const toolResult = events.find((event) => event.type === 'tool-result');
    assert.ok(
      toolResult && toolResult.type === 'tool-result' && toolResult.ok === true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
