#!/usr/bin/env node
// Gera docs/architecture/api-reference.md a partir dos JSON Schemas declarados nas rotas
// Fastify em apps/api/src/routes/*.ts, lidas diretamente do código-fonte real (sem
// reescrever manualmente nenhum schema) para que a documentação nunca divirja do que
// realmente roda.
//
// Uso:
//   node scripts/generate-api-docs.mjs          # (re)gera docs/architecture/api-reference.md
//   node scripts/generate-api-docs.mjs --check   # falha (exit 1) se o arquivo divergir
//
// Como funciona: em vez de fazer parsing estático do TypeScript, este script lê
// apps/api/src/app.ts para descobrir, na ordem real de registro, quais plugins de rota
// existem (todo `import { xxxRoutes } from './routes/algo.js'` referenciado em app.ts).
// Cada plugin é então importado e executado contra uma instância "stub" do Fastify que
// apenas registra `{ method, url, schema }` para cada `app.get/post/put/patch/delete(...)`
// chamado — sem subir um servidor de verdade, sem tocar em rede/filesystem além da leitura
// dos próprios arquivos-fonte. Isso garante que os JSON Schemas exibidos são exatamente os
// objetos reais definidos no código (incluindo os schemas de erro compartilhados via
// spread, ex. `...commonErrorResponseSchemas`), não uma cópia mantida à mão.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appTsPath = path.join(repoRoot, 'apps/api/src/app.ts');
const outputPath = path.join(repoRoot, 'docs/architecture/api-reference.md');
const routesDir = path.join(repoRoot, 'apps/api/src/routes');

const CHECK_MODE = process.argv.includes('--check');

// --- 1. Descobre os plugins de rota registrados, lendo apps/api/src/app.ts -------------

async function discoverRoutePlugins() {
  const source = await readFile(appTsPath, 'utf8');

  const importRegex =
    /import\s*\{\s*([A-Za-z0-9_]+)\s*\}\s*from\s*['"]\.\/routes\/([^'"]+)\.js['"]\s*;/g;

  const plugins = [];
  let match;

  while ((match = importRegex.exec(source)) !== null) {
    const [, exportName, relativePath] = match;
    plugins.push({
      exportName,
      // Grupo usado para agrupar rotas na doc (ex. "workspaces", "git-sync").
      group: relativePath,
      filePath: path.join(routesDir, `${relativePath}.ts`),
    });
  }

  if (plugins.length === 0) {
    throw new Error(
      `Nenhum import de './routes/*.js' encontrado em ${appTsPath}. O regex de descoberta ` +
        'pode estar desatualizado em relação ao formato de app.ts.',
    );
  }

  return plugins;
}

// --- 2. Stub mínimo de Fastify: só registra (method, url, schema) ----------------------

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function createUndefinedProxy() {
  const handler = {
    get() {
      return proxy;
    },
    apply() {
      return proxy;
    },
  };
  const proxy = new Proxy(function stubOptionValue() {}, handler);
  return proxy;
}

function createStubApp(prefix, collected) {
  const stub = {};

  const recordRoute = (method, url, opts) => {
    const schema = opts && typeof opts === 'object' ? opts.schema : undefined;
    collected.push({
      method: method.toUpperCase(),
      url: `${prefix}${url}`,
      schema,
    });
  };

  for (const method of HTTP_METHODS) {
    stub[method] = (url, optsOrHandler, _maybeHandler) => {
      const opts = typeof optsOrHandler === 'function' ? undefined : optsOrHandler;
      recordRoute(method, url, opts);
      return stub;
    };
  }

  stub.route = (opts) => {
    const methods = Array.isArray(opts.method) ? opts.method : [opts.method];
    for (const method of methods) {
      recordRoute(method, opts.url, opts);
    }
    return stub;
  };

  // Nenhum arquivo de rota atual faz `app.register(...)` aninhado dentro de outro plugin
  // de rota (verificado via grep em apps/api/src/routes) — mas cobrimos o caso mesmo assim,
  // achatando no mesmo stub/prefixo em vez de ignorar silenciosamente.
  stub.register = async (plugin, opts) => {
    await plugin(stub, opts ?? {});
  };

  stub.addHook = () => stub;
  stub.decorate = () => stub;
  stub.decorateRequest = () => stub;
  stub.decorateReply = () => stub;
  stub.after = (fn) => {
    if (typeof fn === 'function') fn();
    return stub;
  };
  stub.log = { info() {}, warn() {}, error() {}, debug() {} };

  return stub;
}

async function collectRoutes(plugins) {
  const routes = [];

  for (const plugin of plugins) {
    const moduleUrl = `${new URL(`file://${plugin.filePath}`)}`;
    const mod = await import(moduleUrl);
    const pluginFn = mod[plugin.exportName];

    if (typeof pluginFn !== 'function') {
      throw new Error(
        `${plugin.filePath} não exporta uma função chamada '${plugin.exportName}' ` +
          '(esperado a partir do import em app.ts).',
      );
    }

    const collected = [];
    const stubApp = createStubApp('/api', collected);
    const proxyOptions = createUndefinedProxy();

    await pluginFn(stubApp, proxyOptions);

    for (const route of collected) {
      routes.push({ ...route, group: plugin.group });
    }
  }

  return routes;
}

// --- 3. Renderização em Markdown --------------------------------------------------------

const API_ERROR_SHAPE_KEYS = ['error', 'message'];

function isStandardApiErrorSchema(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.type !== 'object') return false;
  const required = schema.required ?? [];
  const properties = schema.properties ?? {};
  return (
    API_ERROR_SHAPE_KEYS.every((key) => required.includes(key)) &&
    properties.error?.type === 'string' &&
    properties.message?.type === 'string'
  );
}

function jsonFence(value) {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
}

function renderResponseSection(response) {
  if (!response) return '_Sem schema de resposta declarado._';

  const lines = [];
  const statusCodes = Object.keys(response).sort();

  for (const statusCode of statusCodes) {
    const schema = response[statusCode];

    if (isStandardApiErrorSchema(schema)) {
      lines.push(`- **${statusCode}** — erro padrão da API (ver [Erros comuns](#erros-comuns)).`);
      continue;
    }

    lines.push(`- **${statusCode}**:\n\n${indent(jsonFence(schema), 2)}`);
  }

  return lines.join('\n');
}

function indent(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join('\n');
}

function renderRequestSection(label, schema) {
  if (!schema) return null;
  return `**${label}**\n\n${jsonFence(schema)}`;
}

function groupTitle(group) {
  return group
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderRoutes(routes) {
  const byGroup = new Map();

  for (const route of routes) {
    if (!byGroup.has(route.group)) byGroup.set(route.group, []);
    byGroup.get(route.group).push(route);
  }

  const groups = [...byGroup.keys()].sort();

  const sections = groups.map((group) => {
    const groupRoutes = byGroup
      .get(group)
      .sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method));

    const routeBlocks = groupRoutes.map((route) => {
      const schema = route.schema ?? {};
      const parts = [`### \`${route.method} ${route.url}\``];

      const requestSections = [
        renderRequestSection('Parâmetros de rota (`params`)', schema.params),
        renderRequestSection('Query string (`querystring`)', schema.querystring),
        renderRequestSection('Corpo (`body`)', schema.body),
      ].filter(Boolean);

      if (requestSections.length > 0) {
        parts.push(requestSections.join('\n\n'));
      } else if (!schema.response) {
        parts.push('_Rota sem schema declarado (ex. upgrade de WebSocket)._');
      }

      if (schema.response) {
        parts.push(`**Resposta**\n\n${renderResponseSection(schema.response)}`);
      }

      return parts.join('\n\n');
    });

    return `## ${groupTitle(group)}\n\n${routeBlocks.join('\n\n')}`;
  });

  return sections.join('\n\n');
}

const HEADER = `# Referência da API HTTP local

> Documento gerado automaticamente por \`scripts/generate-api-docs.mjs\` a partir dos JSON
> Schemas declarados nas rotas Fastify (\`apps/api/src/routes/*.ts\`) e dos schemas de resposta
> compartilhados em \`apps/api/src/http/response-schemas.ts\`. **Não edite este arquivo à mão** —
> rode \`npm run docs:api\` depois de alterar uma rota. \`npm run docs:api:check\` falha se este
> arquivo estiver desatualizado em relação ao código.

Todas as rotas abaixo (exceto \`GET /api/health\`) exigem o header \`X-Dev-Dashboard-Token\` com o
token local persistido em \`~/.config/dev-dashboard/api-token\`. Veja
\`docs/architecture/security.md\` para o modelo de segurança completo.

## Erros comuns

A maioria das rotas pode responder com o formato de erro padrão da API
(\`apps/api/src/http/api-error.ts\`) nos códigos 400, 401, 403, 404, 409 e/ou 500 — o schema é
sempre o mesmo:

${indent(jsonFence({
  type: 'object',
  additionalProperties: false,
  required: ['error', 'message'],
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['message'],
        properties: { path: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
}), 0)}

Abaixo, cada rota referencia este formato como "erro padrão da API" em vez de repetir o schema.

`;

async function main() {
  const plugins = await discoverRoutePlugins();
  const routes = await collectRoutes(plugins);

  routes.sort((a, b) => a.group.localeCompare(b.group));

  const body = renderRoutes(routes);
  const generated = `${HEADER}${body}\n`;

  if (CHECK_MODE) {
    let current;
    try {
      current = await readFile(outputPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(`[docs:api:check] ${outputPath} não existe. Rode "npm run docs:api".`);
        process.exit(1);
      }
      throw error;
    }

    if (current !== generated) {
      console.error(
        `[docs:api:check] ${path.relative(repoRoot, outputPath)} está desatualizado. ` +
          'Rode "npm run docs:api" e commite o resultado.',
      );
      process.exit(1);
    }

    console.log(`[docs:api:check] ${path.relative(repoRoot, outputPath)} está atualizado (${routes.length} rotas).`);
    return;
  }

  await writeFile(outputPath, generated, 'utf8');
  console.log(`[docs:api] ${path.relative(repoRoot, outputPath)} gerado com ${routes.length} rotas.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
