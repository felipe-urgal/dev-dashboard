import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

/**
 * "Test double" HTTP do Ollama para o smoke E2E do assistente de IA: expõe
 * só os quatro endpoints que `AiAssistantService` de fato chama
 * (`apps/api/src/services/ai-assistant-service.ts`), com respostas fixas e
 * determinísticas. Não reimplementa nenhuma lógica de modelo — existe só
 * para o smoke exercitar o caminho ponta a ponta (API + painel de chat +
 * compleção inline) sem depender de um Ollama real instalado no ambiente de
 * CI.
 *
 * Também emite `tool_calls` (formato de function-calling do Ollama) quando a
 * última mensagem do usuário contém um dos gatilhos abaixo — cobre o
 * round-trip completo de `propose_workspace_edit`/`get_symbol_definition`/
 * `get_symbol_references` (chamada da ferramenta pelo "modelo", execução no
 * servidor, evento de resultado renderizado no painel), sem precisar de um
 * modelo real nem de um language server real rodando no ambiente de teste.
 */
const MODEL_NAME = 'e2e-mock-model';
export const OLLAMA_DOUBLE_ASSISTANT_REPLY =
  'Resposta de teste do Ollama simulado.';
export const OLLAMA_DOUBLE_COMPLETION_TEXT = 'texto sugerido';
export const OLLAMA_DOUBLE_FOLLOW_UP_REPLY =
  'Pronto, terminei de usar a ferramenta.';

export const OLLAMA_DOUBLE_PROPOSE_EDIT_TRIGGER = '__e2e_propose_edit__';
export const OLLAMA_DOUBLE_SYMBOL_DEFINITION_TRIGGER =
  '__e2e_symbol_definition__';
export const OLLAMA_DOUBLE_SYMBOL_REFERENCES_TRIGGER =
  '__e2e_symbol_references__';

/**
 * Alvo da edição proposta: a segunda linha de `package.json` no fixture
 * `sample-node-app` (ver `writeSampleNodeProject` em `server-harness.ts`),
 * `  "name": "sample-node-app",` — 28 caracteres, colunas 1 a 29 cobrem a
 * linha inteira (coluna final exclusiva).
 */
export const OLLAMA_DOUBLE_EDIT_TARGET_PATH = 'package.json';
export const OLLAMA_DOUBLE_EDIT_NEW_TEXT = '  "name": "sample-node-app-v2",';
const EDIT_LINE = 2;
const EDIT_END_COLUMN = 29;

export interface RunningOllamaDouble {
  server: Server;
  baseUrl: string;
}

interface OllamaChatMessage {
  role?: string;
  content?: string;
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

function sendTextReply(response: ServerResponse, content: string): void {
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  response.write(
    `${JSON.stringify({ message: { role: 'assistant', content } })}\n`,
  );
  response.write(
    `${JSON.stringify({ message: { role: 'assistant', content: '' }, done: true })}\n`,
  );
  response.end();
}

function sendToolCall(
  response: ServerResponse,
  name: string,
  args: Record<string, unknown>,
): void {
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  response.write(
    `${JSON.stringify({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name, arguments: args } }],
      },
    })}\n`,
  );
  response.write(
    `${JSON.stringify({ message: { role: 'assistant', content: '' }, done: true })}\n`,
  );
  response.end();
}

function lastMessage(
  body: Record<string, unknown>,
): OllamaChatMessage | undefined {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.at(-1) as OllamaChatMessage | undefined;
}

function handleChat(
  response: ServerResponse,
  body: Record<string, unknown>,
): void {
  const last = lastMessage(body);

  // Segunda rodada da conversa (depois de `AiAssistantService` executar a
  // ferramenta e anexar o resultado como uma mensagem `role: 'tool'`):
  // encerra com uma resposta de texto comum, sem nova tool_call.
  if (last?.role === 'tool') {
    sendTextReply(response, OLLAMA_DOUBLE_FOLLOW_UP_REPLY);
    return;
  }

  const content = last?.content ?? '';

  if (content.includes(OLLAMA_DOUBLE_PROPOSE_EDIT_TRIGGER)) {
    sendToolCall(response, 'propose_workspace_edit', {
      files: [
        {
          path: OLLAMA_DOUBLE_EDIT_TARGET_PATH,
          edits: [
            {
              range: {
                start: { line: EDIT_LINE, column: 1 },
                end: { line: EDIT_LINE, column: EDIT_END_COLUMN },
              },
              newText: OLLAMA_DOUBLE_EDIT_NEW_TEXT,
            },
          ],
        },
      ],
    });
    return;
  }

  if (content.includes(OLLAMA_DOUBLE_SYMBOL_DEFINITION_TRIGGER)) {
    sendToolCall(response, 'get_symbol_definition', {
      path: OLLAMA_DOUBLE_EDIT_TARGET_PATH,
      line: EDIT_LINE,
      column: 3,
    });
    return;
  }

  if (content.includes(OLLAMA_DOUBLE_SYMBOL_REFERENCES_TRIGGER)) {
    sendToolCall(response, 'get_symbol_references', {
      path: OLLAMA_DOUBLE_EDIT_TARGET_PATH,
      line: EDIT_LINE,
      column: 3,
    });
    return;
  }

  sendTextReply(response, OLLAMA_DOUBLE_ASSISTANT_REPLY);
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = request.url ?? '';

  if (request.method === 'GET' && url === '/api/tags') {
    sendJson(response, { models: [{ name: MODEL_NAME }] });
    return;
  }

  if (request.method === 'POST' && url === '/api/show') {
    await readJsonBody(request);
    sendJson(response, { capabilities: ['completion', 'tools', 'insert'] });
    return;
  }

  if (request.method === 'POST' && url === '/api/chat') {
    const body = await readJsonBody(request);
    handleChat(response, body);
    return;
  }

  if (request.method === 'POST' && url === '/api/generate') {
    await readJsonBody(request);
    sendJson(response, { response: OLLAMA_DOUBLE_COMPLETION_TEXT });
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found' }));
}

export async function startOllamaDouble(): Promise<RunningOllamaDouble> {
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Não foi possível determinar a porta do double do Ollama.');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

export async function stopOllamaDouble(
  running: RunningOllamaDouble,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    running.server.close((error) => (error ? reject(error) : resolve()));
  });
}
