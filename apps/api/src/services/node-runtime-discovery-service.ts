import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import { readLimitedText } from './project-doctor/file-utils.js';
import { readToolVersions } from './project-doctor/tool-versions.js';

const MAX_RUNTIME_DECLARATION_LENGTH = 64;

export type NodeRuntimeDiscoveryState =
  'declared' | 'missing' | 'invalid' | 'conflict';

export type NodeRuntimeDeclarationSource =
  '.node-version' | '.nvmrc' | '.tool-versions#node' | '.tool-versions#nodejs';

export interface NodeRuntimeDeclaration {
  source: NodeRuntimeDeclarationSource;
  raw: string;
  version?: string;
}

export interface NodeRuntimeDiscovery {
  state: NodeRuntimeDiscoveryState;
  observedAt: string;
  declarations: NodeRuntimeDeclaration[];
  version?: string;
  diagnostic?: string;
}

export interface NodeRuntimeDiscoveryServiceOptions {
  now?: () => Date;
}

function normalizeExactNodeVersion(value: string): string | undefined {
  const normalized = value.trim().replace(/^v/u, '');
  if (
    !normalized ||
    normalized.length > MAX_RUNTIME_DECLARATION_LENGTH ||
    normalized.includes('\0')
  ) {
    return undefined;
  }

  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(normalized)
    ? normalized
    : undefined;
}

async function readFileDeclaration(
  project: Project,
  source: '.node-version' | '.nvmrc',
): Promise<NodeRuntimeDeclaration | undefined> {
  const content = await readLimitedText(path.join(project.path, source));
  const raw = content?.trim();
  if (!raw) return undefined;

  const version = normalizeExactNodeVersion(raw);
  return {
    source,
    raw,
    ...(version ? { version } : {}),
  };
}

async function readToolVersionDeclarations(
  project: Project,
): Promise<NodeRuntimeDeclaration[]> {
  const declarations = await readToolVersions(project);
  return declarations
    .filter((entry) => entry.tool === 'node' || entry.tool === 'nodejs')
    .map((entry) => {
      const version = normalizeExactNodeVersion(entry.value);
      return {
        source: `${entry.source}#${entry.tool}` as NodeRuntimeDeclarationSource,
        raw: entry.value,
        ...(version ? { version } : {}),
      };
    });
}

export class NodeRuntimeDiscoveryService {
  private readonly now: () => Date;

  public constructor(options: NodeRuntimeDiscoveryServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  public async inspect(project: Project): Promise<NodeRuntimeDiscovery> {
    const [nodeVersion, nvmrc, toolVersions] = await Promise.all([
      readFileDeclaration(project, '.node-version'),
      readFileDeclaration(project, '.nvmrc'),
      readToolVersionDeclarations(project),
    ]);
    const declarations = [nodeVersion, nvmrc, ...toolVersions].filter(
      (entry): entry is NodeRuntimeDeclaration => entry !== undefined,
    );
    const observedAt = this.now().toISOString();

    if (declarations.length === 0) {
      return {
        state: 'missing',
        observedAt,
        declarations: [],
        diagnostic:
          'O projeto não declara um runtime Node exato em .node-version, .nvmrc ou .tool-versions.',
      };
    }

    const invalid = declarations.filter(
      (declaration) => declaration.version === undefined,
    );
    if (invalid.length > 0) {
      return {
        state: 'invalid',
        observedAt,
        declarations,
        diagnostic: `Há declarações de runtime Node que não são versões exatas: ${invalid
          .map((declaration) => `${declaration.source}=${declaration.raw}`)
          .join(', ')}.`,
      };
    }

    const versions = new Set(
      declarations.map((declaration) => declaration.version!),
    );
    if (versions.size > 1) {
      return {
        state: 'conflict',
        observedAt,
        declarations,
        diagnostic: `As fontes versionadas do projeto divergem: ${declarations
          .map(
            (declaration) =>
              `${declaration.source}=${declaration.version ?? declaration.raw}`,
          )
          .join(', ')}.`,
      };
    }

    return {
      state: 'declared',
      observedAt,
      declarations,
      version: declarations[0]!.version!,
    };
  }
}
