import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import type * as Monaco from 'monaco-editor';
import type { ProjectAiStatus } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  status: vi.fn(),
  complete: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectAiStatus: api.status,
  completeProjectAi: api.complete,
}));

import { AiInlineCompletionProvider } from '../src/language-server/ai-inline-completion';

interface FakeToken {
  isCancellationRequested: boolean;
  onCancellationRequested: (listener: () => void) => { dispose: () => void };
  trigger: () => void;
}

function fakeToken(): FakeToken {
  const listeners: Array<() => void> = [];
  const token: FakeToken = {
    isCancellationRequested: false,
    onCancellationRequested: (listener) => {
      listeners.push(listener);
      return { dispose: () => undefined };
    },
    trigger: () => {
      token.isCancellationRequested = true;
      for (const listener of listeners) listener();
    },
  };
  return token;
}

function fakeMonaco() {
  let provider: Monaco.languages.InlineCompletionsProvider | undefined;
  const registerInlineCompletionsProvider = vi.fn(
    (_selector: unknown, value: Monaco.languages.InlineCompletionsProvider) => {
      provider = value;
      return { dispose: vi.fn() };
    },
  );
  return {
    instance: {
      languages: { registerInlineCompletionsProvider },
    } as unknown as typeof Monaco,
    registerInlineCompletionsProvider,
    provider: () => provider,
  };
}

function fakeModel(prefix: string, suffix: string): Monaco.editor.ITextModel {
  return {
    uri: { toString: () => 'file:///dev-dashboard/projects/project-1/app.rb' },
    getValueInRange: (range: Monaco.IRange) =>
      range.startLineNumber === 1 && range.startColumn === 1 ? prefix : suffix,
    getLineCount: () => 1,
    getLineMaxColumn: () => suffix.length + 1,
  } as unknown as Monaco.editor.ITextModel;
}

const position = { lineNumber: 1, column: 10 } as Monaco.Position;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('não registra o provider quando o Ollama está indisponível', async () => {
  api.status.mockResolvedValue({
    available: false,
    models: [],
    message: 'indisponível',
  } satisfies ProjectAiStatus);
  const monaco = fakeMonaco();
  const provider = new AiInlineCompletionProvider(monaco.instance, 'project-1');
  await provider.initialize();
  assert.equal(monaco.registerInlineCompletionsProvider.mock.calls.length, 0);
});

test('prefere um modelo com capacidade fill-in-the-middle e devolve a sugestão', async () => {
  api.status.mockResolvedValue({
    available: true,
    models: [
      { name: 'llama3.1', capabilities: ['chat'] },
      { name: 'qwen2.5-coder', capabilities: ['chat', 'fill-in-the-middle'] },
    ],
    message: 'ok',
  } satisfies ProjectAiStatus);
  api.complete.mockResolvedValue({ text: 'sum(a, b)' });

  const monaco = fakeMonaco();
  const provider = new AiInlineCompletionProvider(monaco.instance, 'project-1');
  await provider.initialize();
  assert.equal(monaco.registerInlineCompletionsProvider.mock.calls.length, 1);

  const model = fakeModel('function sum(a, b) {\n  return ', '\n}');
  const token = fakeToken();
  const resultPromise = monaco
    .provider()!
    .provideInlineCompletions(
      model,
      position,
      {} as Monaco.languages.InlineCompletionContext,
      token as unknown as Monaco.CancellationToken,
    );
  await vi.advanceTimersByTimeAsync(500);
  const result = await resultPromise;

  assert.equal(api.complete.mock.calls[0]?.[0], 'project-1');
  assert.equal(api.complete.mock.calls[0]?.[1], 'qwen2.5-coder');
  assert.equal(
    result && 'items' in result ? result.items[0]?.insertText : undefined,
    'sum(a, b)',
  );
});

test('não chama a API quando o token cancela durante o debounce', async () => {
  api.status.mockResolvedValue({
    available: true,
    models: [{ name: 'llama3.1', capabilities: ['chat'] }],
    message: 'ok',
  } satisfies ProjectAiStatus);

  const monaco = fakeMonaco();
  const provider = new AiInlineCompletionProvider(monaco.instance, 'project-1');
  await provider.initialize();

  const model = fakeModel('const x = ', '');
  const token = fakeToken();
  const resultPromise = monaco
    .provider()!
    .provideInlineCompletions(
      model,
      position,
      {} as Monaco.languages.InlineCompletionContext,
      token as unknown as Monaco.CancellationToken,
    );
  token.trigger();
  await vi.advanceTimersByTimeAsync(500);
  const result = await resultPromise;

  assert.equal(api.complete.mock.calls.length, 0);
  assert.deepEqual(result, { items: [] });
});

test('reaproveita o cache para o mesmo prefixo/sufixo sem chamar a API de novo', async () => {
  api.status.mockResolvedValue({
    available: true,
    models: [{ name: 'llama3.1', capabilities: ['chat'] }],
    message: 'ok',
  } satisfies ProjectAiStatus);
  api.complete.mockResolvedValue({ text: 'return 1;' });

  const monaco = fakeMonaco();
  const provider = new AiInlineCompletionProvider(monaco.instance, 'project-1');
  await provider.initialize();

  const model = fakeModel('function one() {\n  ', '\n}');

  async function ask(): Promise<unknown> {
    const token = fakeToken();
    const resultPromise = monaco
      .provider()!
      .provideInlineCompletions(
        model,
        position,
        {} as Monaco.languages.InlineCompletionContext,
        token as unknown as Monaco.CancellationToken,
      );
    await vi.advanceTimersByTimeAsync(500);
    return resultPromise;
  }

  await ask();
  await ask();

  assert.equal(api.complete.mock.calls.length, 1);
});

test('cache tem tamanho máximo e descarta a entrada mais antiga', async () => {
  api.status.mockResolvedValue({
    available: true,
    models: [{ name: 'llama3.1', capabilities: ['chat'] }],
    message: 'ok',
  } satisfies ProjectAiStatus);
  api.complete.mockImplementation(
    async (_projectId: string, _model: string, prefix: string) => ({
      text: `sugestao para ${prefix}`,
    }),
  );

  const monaco = fakeMonaco();
  const provider = new AiInlineCompletionProvider(monaco.instance, 'project-1');
  await provider.initialize();

  async function ask(prefix: string): Promise<void> {
    const model = fakeModel(prefix, '');
    const token = fakeToken();
    const resultPromise = monaco
      .provider()!
      .provideInlineCompletions(
        model,
        position,
        {} as Monaco.languages.InlineCompletionContext,
        token as unknown as Monaco.CancellationToken,
      );
    await vi.advanceTimersByTimeAsync(500);
    await resultPromise;
  }

  for (let i = 0; i < 51; i += 1) await ask(`prefixo-${i}`);
  assert.equal(api.complete.mock.calls.length, 51);

  // A primeira entrada (prefixo-0) deve ter sido descartada ao inserir a
  // 51ª — o cache tem limite de 50 — então pedi-la de novo é uma nova
  // chamada à API, não um acerto de cache.
  await ask('prefixo-0');
  assert.equal(api.complete.mock.calls.length, 52);
});

test('aborta a chamada em andamento quando o token cancela durante a requisição', async () => {
  api.status.mockResolvedValue({
    available: true,
    models: [{ name: 'llama3.1', capabilities: ['chat'] }],
    message: 'ok',
  } satisfies ProjectAiStatus);

  let capturedSignal: AbortSignal | undefined;
  let resolveComplete: (() => void) | undefined;
  api.complete.mockImplementation(
    (
      _projectId: string,
      _model: string,
      _prefix: string,
      _suffix: string,
      signal: AbortSignal,
    ) => {
      capturedSignal = signal;
      return new Promise((resolve) => {
        resolveComplete = () => resolve({ text: '' });
      });
    },
  );

  const monaco = fakeMonaco();
  const provider = new AiInlineCompletionProvider(monaco.instance, 'project-1');
  await provider.initialize();

  const model = fakeModel('const x = ', '');
  const token = fakeToken();
  const resultPromise = monaco
    .provider()!
    .provideInlineCompletions(
      model,
      position,
      {} as Monaco.languages.InlineCompletionContext,
      token as unknown as Monaco.CancellationToken,
    );
  await vi.advanceTimersByTimeAsync(500);

  assert.ok(capturedSignal);
  assert.equal(capturedSignal?.aborted, false);

  token.trigger();
  assert.equal(capturedSignal?.aborted, true);

  resolveComplete?.();
  const result = await resultPromise;
  assert.deepEqual(result, { items: [] });
});
