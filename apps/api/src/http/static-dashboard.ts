import { access, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const BROWSER_BOOTSTRAP_PATTERN = /^[a-f0-9]{64}$/;

export interface StaticDashboardOptions {
  browserBootstrapToken?: string;
}

export async function validateDashboardBuild(
  directory: string,
): Promise<string> {
  let root: string;
  try {
    root = await realpath(directory);
    if (!(await stat(root)).isDirectory()) throw new Error();
  } catch {
    throw new Error(
      `O diretório do frontend não existe ou não é válido: ${directory}`,
    );
  }
  const indexPath = path.join(root, 'index.html');
  let html: string;
  try {
    html = await readFile(indexPath, 'utf8');
  } catch {
    throw new Error(`O frontend distribuído não contém index.html: ${root}`);
  }
  const referenced = [
    ...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g),
  ].map((match) => match[1]!);
  if (referenced.length === 0)
    throw new Error(`O index.html não referencia assets obrigatórios: ${root}`);
  for (const asset of referenced) {
    try {
      await access(path.join(root, asset.slice(1)));
    } catch {
      throw new Error(`Asset obrigatório ausente no frontend: ${asset}`);
    }
  }
  return root;
}

function injectBrowserBootstrap(
  html: string,
  token: string | undefined,
): string {
  if (!token) return html;
  if (!BROWSER_BOOTSTRAP_PATTERN.test(token)) {
    throw new Error('Bootstrap de navegador inválido para o frontend local.');
  }

  // O fragmento não é enviado ao servidor. O cliente existente o consome,
  // move a capacidade para sessionStorage e limpa a URL antes de usar a API.
  const bootstrapScript = `<script>window.location.hash="bootstrap=${token}"</script>`;
  return html.includes('</head>')
    ? html.replace('</head>', `${bootstrapScript}</head>`)
    : `${bootstrapScript}${html}`;
}

export async function registerStaticDashboard(
  app: FastifyInstance,
  directory: string,
  options: StaticDashboardOptions = {},
): Promise<void> {
  const root = await validateDashboardBuild(directory);
  const indexPath = path.join(root, 'index.html');
  const index = injectBrowserBootstrap(
    await readFile(indexPath, 'utf8'),
    options.browserBootstrapToken,
  );

  app.setNotFoundHandler(async (request, reply) => {
    const rawPathname = request.url.split('?', 1)[0] ?? '/';
    let pathname: string;
    try {
      pathname = decodeURIComponent(rawPathname);
    } catch {
      return reply
        .code(400)
        .send({ error: 'INVALID_PATH', message: 'Caminho inválido.' });
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return reply
        .code(404)
        .send({ error: 'NOT_FOUND', message: 'Rota da API não encontrada.' });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return reply.code(404).send();

    const candidate = path.resolve(root, `.${pathname}`);
    if (candidate.startsWith(`${root}${path.sep}`)) {
      try {
        const canonical = await realpath(candidate);
        if (
          canonical.startsWith(`${root}${path.sep}`) &&
          (await stat(canonical)).isFile()
        ) {
          const extension = path.extname(canonical).toLowerCase();
          reply.type(CONTENT_TYPES[extension] ?? 'application/octet-stream');
          reply.header(
            'Cache-Control',
            pathname.startsWith('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
          );
          if (request.method === 'HEAD') return reply.send();
          return canonical === indexPath
            ? reply.send(index)
            : reply.send(await readFile(canonical));
        }
      } catch {
        /* arquivo ausente segue para fallback ou 404 */
      }
    }

    if (
      pathname.startsWith('/assets/') ||
      !String(request.headers.accept ?? '').includes('text/html')
    ) {
      return reply.code(404).send();
    }
    reply.type(CONTENT_TYPES['.html']!).header('Cache-Control', 'no-cache');
    return request.method === 'HEAD' ? reply.send() : reply.send(index);
  });
}
