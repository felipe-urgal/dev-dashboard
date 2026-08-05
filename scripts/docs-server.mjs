import { createServer } from 'node:http';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4545;
const MAX_SEARCH_RESULTS = 30;
const SEARCH_CONTENT_LIMIT = 1_000_000;
const TEXT_ENCODER = new TextEncoder();

const CORE_PRIORITY = new Map([
  ['docs/index.md', 0],
  ['README.md', 10],
  ['docs/getting-started.md', 20],
  ['docs/architecture/overview.md', 30],
  ['docs/architecture/repository-structure.md', 40],
  ['docs/architecture/runtime-flows.md', 50],
  ['docs/architecture/security.md', 60],
  ['docs/development-guide.md', 70],
  ['docs/operations-and-troubleshooting.md', 80],
  ['docs/documentation-api.md', 90],
  ['CONTRIBUTING.md', 100],
  ['docs/architecture/api-reference.md', 110],
  ['docs/roadmap.md', 120],
  ['docs/PENDENCIAS.md', 130],
  ['docs/tasks/NEXT.md', 140],
]);

const GROUP_PRIORITY = new Map([
  ['Visão geral', 0],
  ['Primeiros passos', 10],
  ['Arquitetura', 20],
  ['Desenvolvimento', 30],
  ['Operação', 40],
  ['Referência', 50],
  ['Planejamento e histórico', 60],
  ['Outros documentos', 70],
]);

function normalizeRepositoryPath(value) {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

function documentGroup(repositoryPath) {
  if (repositoryPath === 'docs/index.md' || repositoryPath === 'README.md') return 'Visão geral';
  if (repositoryPath === 'docs/getting-started.md') return 'Primeiros passos';
  if (repositoryPath.startsWith('docs/architecture/')) return 'Arquitetura';
  if (repositoryPath === 'docs/development-guide.md' || repositoryPath === 'CONTRIBUTING.md') return 'Desenvolvimento';
  if (repositoryPath === 'docs/operations-and-troubleshooting.md') return 'Operação';
  if (repositoryPath === 'docs/documentation-api.md') return 'Referência';
  if (
    repositoryPath.startsWith('docs/tasks/') ||
    repositoryPath === 'docs/roadmap.md' ||
    repositoryPath === 'docs/PENDENCIAS.md'
  ) return 'Planejamento e histórico';
  if (repositoryPath.startsWith('docs/')) return 'Referência';
  return 'Outros documentos';
}

function titleFromMarkdown(markdown, fallbackPath) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.replace(/[`*_]/g, '');
  return path.basename(fallbackPath, '.md').replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function descriptionFromMarkdown(markdown) {
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, '');
  const paragraphs = withoutFences
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !paragraph.startsWith('#') && !paragraph.startsWith('>') && !paragraph.startsWith('|'));
  const text = (paragraphs[0] ?? '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
}

function headingsFromMarkdown(markdown) {
  return markdown
    .split('\n')
    .map((line) => line.match(/^(#{1,4})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ level: match[1].length, title: match[2].replace(/[`*_]/g, '').trim() }));
}

async function walkMarkdownFiles(directory, rootDirectory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return files;
    throw error;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'site') continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkMarkdownFiles(absolutePath, rootDirectory));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(normalizeRepositoryPath(path.relative(rootDirectory, absolutePath)));
    }
  }
  return files;
}

export async function buildCatalog(rootDirectory = process.cwd()) {
  const candidates = new Set(await walkMarkdownFiles(path.join(rootDirectory, 'docs'), rootDirectory));
  for (const rootDocument of ['README.md', 'CONTRIBUTING.md']) {
    try {
      const fileStat = await stat(path.join(rootDirectory, rootDocument));
      if (fileStat.isFile()) candidates.add(rootDocument);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const pages = [];
  for (const repositoryPath of candidates) {
    const absolutePath = path.join(rootDirectory, repositoryPath);
    const markdown = await readFile(absolutePath, 'utf8');
    const group = documentGroup(repositoryPath);
    pages.push({
      path: repositoryPath,
      title: titleFromMarkdown(markdown, repositoryPath),
      description: descriptionFromMarkdown(markdown),
      group,
      priority: CORE_PRIORITY.get(repositoryPath) ?? 10_000,
      bytes: TEXT_ENCODER.encode(markdown).byteLength,
      headings: headingsFromMarkdown(markdown),
      archived: repositoryPath.startsWith('docs/tasks/') && repositoryPath !== 'docs/tasks/NEXT.md',
    });
  }

  pages.sort((a, b) => {
    const groupDifference = (GROUP_PRIORITY.get(a.group) ?? 999) - (GROUP_PRIORITY.get(b.group) ?? 999);
    if (groupDifference !== 0) return groupDifference;
    const priorityDifference = a.priority - b.priority;
    if (priorityDifference !== 0) return priorityDifference;
    return a.title.localeCompare(b.title, 'pt-BR');
  });

  const groups = [...new Set(pages.map((page) => page.group))].map((name) => ({
    name,
    pages: pages.filter((page) => page.group === name),
  }));

  return {
    name: 'Dev Dashboard Docs',
    description: 'Documentação técnica e de produto do Dev Dashboard.',
    generatedAt: new Date().toISOString(),
    defaultDocument: pages.some((page) => page.path === 'docs/index.md') ? 'docs/index.md' : pages[0]?.path ?? null,
    groups,
    pages,
  };
}

export async function resolveDocumentPath(rootDirectory, repositoryPath, catalog = null) {
  if (typeof repositoryPath !== 'string' || repositoryPath.length === 0 || repositoryPath.includes('\0')) {
    throw Object.assign(new Error('Documento inválido.'), { code: 'INVALID_DOCUMENT_PATH' });
  }
  const normalizedPath = normalizeRepositoryPath(path.posix.normalize(repositoryPath));
  if (normalizedPath.startsWith('../') || path.posix.isAbsolute(normalizedPath) || !normalizedPath.toLowerCase().endsWith('.md')) {
    throw Object.assign(new Error('Documento fora do escopo permitido.'), { code: 'DOCUMENT_OUTSIDE_SCOPE' });
  }
  if (catalog && !catalog.pages.some((page) => page.path === normalizedPath)) {
    throw Object.assign(new Error('Documento não catalogado.'), { code: 'DOCUMENT_NOT_FOUND' });
  }

  const rootRealPath = await realpath(rootDirectory);
  const candidatePath = path.resolve(rootDirectory, normalizedPath);
  const candidateRealPath = await realpath(candidatePath);
  const rootPrefix = `${rootRealPath}${path.sep}`;
  if (candidateRealPath !== rootRealPath && !candidateRealPath.startsWith(rootPrefix)) {
    throw Object.assign(new Error('Documento fora do repositório.'), { code: 'DOCUMENT_OUTSIDE_SCOPE' });
  }
  return candidateRealPath;
}

function normalizeSearchText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function searchSnippet(markdown, normalizedQuery) {
  const plainText = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedText = normalizeSearchText(plainText);
  const index = normalizedText.indexOf(normalizedQuery);
  const start = Math.max(0, index < 0 ? 0 : index - 90);
  const end = Math.min(plainText.length, start + 260);
  return `${start > 0 ? '…' : ''}${plainText.slice(start, end).trim()}${end < plainText.length ? '…' : ''}`;
}

export async function searchDocuments(rootDirectory, catalog, query) {
  const trimmed = String(query ?? '').trim();
  if (trimmed.length < 2) return [];
  const normalizedQuery = normalizeSearchText(trimmed);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const results = [];

  for (const page of catalog.pages) {
    if (page.bytes > SEARCH_CONTENT_LIMIT) continue;
    const absolutePath = await resolveDocumentPath(rootDirectory, page.path, catalog);
    const markdown = await readFile(absolutePath, 'utf8');
    const titleText = normalizeSearchText(page.title);
    const headingText = normalizeSearchText(page.headings.map((heading) => heading.title).join(' '));
    const bodyText = normalizeSearchText(markdown);
    if (!terms.every((term) => titleText.includes(term) || headingText.includes(term) || bodyText.includes(term))) continue;

    let score = 0;
    for (const term of terms) {
      if (titleText.includes(term)) score += 20;
      if (headingText.includes(term)) score += 8;
      if (bodyText.includes(term)) score += 2;
    }
    if (page.archived) score -= 2;
    results.push({
      path: page.path,
      title: page.title,
      group: page.group,
      snippet: searchSnippet(markdown, normalizedQuery),
      score,
    });
  }

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'pt-BR'))
    .slice(0, MAX_SEARCH_RESULTS)
    .map(({ score: _score, ...result }) => result);
}

function json(response, statusCode, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function text(response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
  });
  response.end(body);
}

function apiError(response, statusCode, code, message) {
  json(response, statusCode, { error: code, message });
}

export function createDocsServer(options = {}) {
  const rootDirectory = path.resolve(options.rootDirectory ?? process.cwd());
  const host = options.host ?? DEFAULT_HOST;
  const requestedPort = Number.parseInt(String(options.port ?? process.env.DEV_DASHBOARD_DOCS_PORT ?? DEFAULT_PORT), 10);
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
    throw new Error('DEV_DASHBOARD_DOCS_PORT deve ser uma porta inteira entre 0 e 65535.');
  }
  const sitePath = path.join(rootDirectory, 'docs/site/index.html');

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', `http://${host}`);
      const method = request.method ?? 'GET';
      if (method !== 'GET' && method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        apiError(response, 405, 'METHOD_NOT_ALLOWED', 'A documentação é somente leitura.');
        return;
      }

      if (requestUrl.pathname === '/api/health') {
        json(response, 200, {
          status: 'ok',
          service: 'dev-dashboard-docs',
          host,
          port: server.address()?.port ?? requestedPort,
        });
        return;
      }

      if (requestUrl.pathname === '/api/docs') {
        json(response, 200, await buildCatalog(rootDirectory));
        return;
      }

      if (requestUrl.pathname === '/api/docs/content') {
        const catalog = await buildCatalog(rootDirectory);
        const repositoryPath = requestUrl.searchParams.get('path') ?? '';
        try {
          const absolutePath = await resolveDocumentPath(rootDirectory, repositoryPath, catalog);
          const markdown = await readFile(absolutePath, 'utf8');
          json(response, 200, {
            path: normalizeRepositoryPath(repositoryPath),
            title: titleFromMarkdown(markdown, repositoryPath),
            markdown,
          });
        } catch (error) {
          if (error?.code === 'ENOENT' || error?.code === 'DOCUMENT_NOT_FOUND') {
            apiError(response, 404, 'DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
            return;
          }
          if (error?.code === 'INVALID_DOCUMENT_PATH' || error?.code === 'DOCUMENT_OUTSIDE_SCOPE') {
            apiError(response, 400, error.code, error.message);
            return;
          }
          throw error;
        }
        return;
      }

      if (requestUrl.pathname === '/api/search') {
        const query = requestUrl.searchParams.get('q') ?? '';
        const catalog = await buildCatalog(rootDirectory);
        json(response, 200, { query, results: await searchDocuments(rootDirectory, catalog, query) });
        return;
      }

      if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
        const html = await readFile(sitePath, 'utf8');
        text(response, 200, html, 'text/html; charset=utf-8');
        return;
      }

      apiError(response, 404, 'NOT_FOUND', 'Recurso de documentação não encontrado.');
    } catch (error) {
      console.error('[docs] Falha ao responder requisição:', error);
      if (!response.headersSent) apiError(response, 500, 'INTERNAL_ERROR', 'Falha interna na documentação.');
      else response.end();
    }
  });

  return {
    server,
    host,
    port: requestedPort,
    rootDirectory,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host, port: requestedPort }, resolve);
      });
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : requestedPort;
      return { host, port: actualPort, url: `http://${host}:${actualPort}` };
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

export async function startDocsServer(options = {}) {
  const docsServer = createDocsServer(options);
  const address = await docsServer.listen();
  console.log(`[docs] Documentação: ${address.url}`);
  console.log(`[docs] Catálogo JSON: ${address.url}/api/docs`);
  return docsServer;
}

async function main() {
  const docsServer = await startDocsServer();
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[docs] Encerrando documentação (${signal})...`);
    try {
      await docsServer.close();
      process.exit(0);
    } catch (error) {
      console.error('[docs] Falha ao encerrar:', error);
      process.exit(1);
    }
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await main();
}
