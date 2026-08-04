import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * "Test double" HTTP do Ollama para o smoke E2E do assistente de IA: expõe
 * só os quatro endpoints que `AiAssistantService` de fato chama
 * (`apps/api/src/services/ai-assistant-service.ts`), com respostas fixas e
 * determinísticas. Não reimplementa nenhuma lógica de modelo — existe só
 * para o smoke exercitar o caminho ponta a ponta (API + painel de chat +
 * compleção inline) sem depender de um Ollama real instalado no ambiente de
 * CI.
 */
const MODEL_NAME = 'e2e-mock-model';
export const OLLAMA_DOUBLE_ASSISTANT_REPLY = 'Resposta de teste do Ollama simulado.';
export const OLLAMA_DOUBLE_COMPLETION_TEXT = 'texto sugerido';

export interface RunningOllamaDouble {
  server: Server;
  baseUrl: string;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
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

function sendChatStream(response: ServerResponse): void {
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  response.write(`${JSON.stringify({ message: { role: 'assistant', content: OLLAMA_DOUBLE_ASSISTANT_REPLY } })}\n`);
  response.write(`${JSON.stringify({ message: { role: 'assistant', content: '' }, done: true })}\n`);
  response.end();
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
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
    await readJsonBody(request);
    sendChatStream(response);
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

export async function stopOllamaDouble(running: RunningOllamaDouble): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    running.server.close((error) => (error ? reject(error) : resolve()));
  });
}
