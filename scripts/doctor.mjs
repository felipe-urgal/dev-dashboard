import { access } from 'node:fs/promises';
import net from 'node:net';
import process from 'node:process';
import { spawn } from 'node:child_process';

const MINIMUM_NODE_VERSION = [20, 19, 0];

export function supportsNodeVersion(version) {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [major = 0, minor = 0, patch = 0] = parts;

  return (
    (major === 20 && (minor > 19 || (minor === 19 && patch >= 0))) ||
    major > 22 ||
    (major === 22 && (minor > 12 || (minor === 12 && patch >= 0)))
  );
}

export function checkCommand(command, args = ['--version']) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.once('error', () => resolve(null));
    child.once('close', (code) => {
      const lines = output.trim().split('\n').filter(Boolean);
      resolve(code === 0 ? lines.at(-1) || 'disponível' : null);
    });
  });
}

export function checkPort(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host, port }, () => {
      server.close(() => resolve(true));
    });
  });
}

function result(status, label, detail) {
  return { status, label, detail };
}

export async function diagnose(options = {}) {
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const commandChecker = options.commandChecker ?? checkCommand;
  const portChecker = options.portChecker ?? checkPort;
  const fileChecker = options.fileChecker ?? access;
  const results = [];
  const distribution = options.mode === 'distribution';

  results.push(
    supportsNodeVersion(nodeVersion)
      ? result('ok', 'Node.js', `v${nodeVersion}`)
      : result(
          'error',
          'Node.js',
          `v${nodeVersion}; necessário >= ${MINIMUM_NODE_VERSION.join('.')} ou uma versão 22.12+`,
        ),
  );

  for (const command of ['npm', 'git']) {
    const version = await commandChecker(command);
    results.push(
      version
        ? result('ok', command, version)
        : result('error', command, 'comando não encontrado ou indisponível'),
    );
  }

  try {
    await fileChecker(new URL('../node_modules', import.meta.url));
    results.push(result('ok', 'Dependências', 'node_modules encontrado'));
  } catch {
    results.push(
      result('error', 'Dependências', 'execute npm install na raiz'),
    );
  }

  const configuredPort = Number.parseInt(
    options.apiPort ?? process.env.DEV_DASHBOARD_API_PORT ?? '4343',
    10,
  );
  const configuredDocsPort = Number.parseInt(
    options.docsPort ?? process.env.DEV_DASHBOARD_DOCS_PORT ?? '4545',
    10,
  );
  const ports = distribution
    ? [['Dashboard', configuredPort]]
    : [
        ['API', 4343],
        ['Web', 5173],
        ['Docs', configuredDocsPort],
      ];

  for (const [label, port] of ports) {
    const available = await portChecker('127.0.0.1', port);
    results.push(
      available
        ? result('ok', `Porta ${label}`, `127.0.0.1:${port} disponível`)
        : result(
            'warning',
            `Porta ${label}`,
            `127.0.0.1:${port} já está em uso`,
          ),
    );
  }

  if (distribution) {
    for (const [label, relativePath] of [
      ['API compilada', 'apps/api/dist/server.js'],
      ['Frontend compilado', 'apps/web/dist/index.html'],
    ]) {
      try {
        await fileChecker(pathToUrl(rootDirectory, relativePath));
        results.push(result('ok', label, relativePath));
      } catch {
        results.push(
          result('warning', label, `${relativePath} será criado pelo build`),
        );
      }
    }
  }

  try {
    await fileChecker(rootDirectory);
    results.push(result('ok', 'Repositório', rootDirectory));
  } catch {
    results.push(
      result(
        'error',
        'Repositório',
        `não foi possível acessar ${rootDirectory}`,
      ),
    );
  }

  return results;
}

function pathToUrl(root, relativePath) {
  return new URL(`file://${root.replace(/\/$/, '')}/${relativePath}`);
}

export async function main() {
  console.log('Diagnóstico do Dev Dashboard\n');
  const results = await diagnose();
  const icons = { ok: '✓', warning: '!', error: '✗' };

  for (const item of results) {
    console.log(`${icons[item.status]} ${item.label}: ${item.detail}`);
  }

  const errors = results.filter((item) => item.status === 'error').length;
  const warnings = results.filter((item) => item.status === 'warning').length;
  console.log(`\nResultado: ${errors} erro(s), ${warnings} aviso(s).`);
  process.exitCode = errors > 0 ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
) {
  await main();
}
