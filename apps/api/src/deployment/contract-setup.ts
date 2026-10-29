import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProductionContractDraft,
  ProductionContractPreview,
  ProductionContractSetupInfo,
} from '@dev-dashboard/contracts';
import {
  PRODUCTION_SCRIPT_BY_OPERATION,
  validateProductionManifest,
} from '@dev-dashboard/project-discovery';

const MANIFEST_DIRECTORY = '.dev-dashboard';
const MANIFEST_FILE = 'production.json';

export class ContractSetupError extends Error {
  public constructor(
    public readonly code: 'INVALID_DRAFT' | 'ALREADY_EXISTS' | 'WRITE_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ContractSetupError';
  }
}

async function readScripts(
  projectPath: string,
): Promise<Record<string, string> | undefined> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(projectPath, 'package.json'), 'utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { scripts?: unknown }).scripts !== 'object' ||
      (parsed as { scripts?: unknown }).scripts === null
    ) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(
        (parsed as { scripts: Record<string, unknown> }).scripts,
      ).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return undefined;
  }
}

/**
 * Monta o manifesto no servidor a partir de campos validados — o cliente nunca
 * envia o JSON final — e normaliza o que cada estratégia exige do contrato.
 */
export function buildProductionManifest(draft: ProductionContractDraft): {
  version: 1;
  production: Record<string, unknown>;
} {
  const selfUpdate = draft.strategy === 'self-update';
  const operations = selfUpdate
    ? (['status', 'check'] as const)
    : [...new Set(draft.commands)];
  const commands = Object.fromEntries(
    operations.map((operation) => [
      operation,
      PRODUCTION_SCRIPT_BY_OPERATION[operation],
    ]),
  );

  return {
    version: 1,
    production: {
      enabled: true,
      strategy: draft.strategy,
      provider:
        draft.strategy === 'self-update'
          ? 'none'
          : draft.strategy === 'git-managed'
            ? 'vercel'
            : draft.provider,
      branch: draft.branch.trim(),
      commands,
      ...(draft.healthUrl?.trim()
        ? { health: { type: 'http', url: draft.healthUrl.trim() } }
        : {}),
      ...(draft.strategy === 'git-managed' && draft.externalProject?.trim()
        ? { external: { project: draft.externalProject.trim() } }
        : {}),
      policies: selfUpdate
        ? {
            backup: 'not-configured',
            migrations: 'not-configured',
            rollback: 'not-configured',
          }
        : draft.policies,
    },
  };
}

export class ProductionContractSetupService {
  public async info(projectPath: string): Promise<ProductionContractSetupInfo> {
    const scripts = (await readScripts(projectPath)) ?? {};
    let manifestExists = false;
    try {
      manifestExists = (
        await stat(path.join(projectPath, MANIFEST_DIRECTORY, MANIFEST_FILE))
      ).isFile();
    } catch {
      manifestExists = false;
    }
    return {
      scripts: Object.keys(scripts)
        .filter((name) => name.startsWith('prod:'))
        .sort(),
      manifestExists,
    };
  }

  public async preview(
    projectPath: string,
    draft: ProductionContractDraft,
  ): Promise<ProductionContractPreview> {
    const scripts = await readScripts(projectPath);
    const manifest = buildProductionManifest(draft);
    const operations = Object.keys(
      manifest.production.commands as Record<string, string>,
    ) as Array<keyof typeof PRODUCTION_SCRIPT_BY_OPERATION>;
    const missingScripts = operations
      .map((operation) => PRODUCTION_SCRIPT_BY_OPERATION[operation])
      .filter((script) => typeof scripts?.[script] !== 'string');

    const detection = validateProductionManifest(manifest, scripts);
    return {
      valid: Boolean(detection.contract),
      ...(detection.warning ? { message: detection.warning.message } : {}),
      missingScripts,
      manifest,
    };
  }

  public async write(
    projectPath: string,
    draft: ProductionContractDraft,
    options: { overwrite: boolean },
  ): Promise<ProductionContractPreview> {
    const preview = await this.preview(projectPath, draft);
    if (!preview.valid) {
      throw new ContractSetupError(
        'INVALID_DRAFT',
        preview.message ?? 'O contrato de produção informado é inválido.',
      );
    }

    const directory = path.join(projectPath, MANIFEST_DIRECTORY);
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, MANIFEST_FILE),
        `${JSON.stringify(preview.manifest, null, 2)}\n`,
        { encoding: 'utf8', flag: options.overwrite ? 'w' : 'wx' },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new ContractSetupError(
          'ALREADY_EXISTS',
          'Este projeto já tem um contrato de produção. Confirme a substituição para sobrescrevê-lo.',
        );
      }
      throw new ContractSetupError(
        'WRITE_FAILED',
        'Não foi possível gravar o contrato de produção no projeto.',
      );
    }
    return preview;
  }
}
