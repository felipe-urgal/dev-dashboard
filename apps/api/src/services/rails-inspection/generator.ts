import type { RailsGeneratorField, RailsGeneratorKind } from '@dev-dashboard/contracts';

import {
  GENERATOR_FIELD_NAME_PATTERN,
  GENERATOR_FIELD_TYPES,
  GENERATOR_MAX_FIELDS,
  GENERATOR_NAME_PATTERN,
} from './constants.js';
import { RailsMutationError } from './errors.js';

export interface StoredGeneratorConfirmation {
  token: string;
  projectId: string;
  kind: RailsGeneratorKind;
  name: string;
  fields: RailsGeneratorField[];
  database?: string;
  args: string[];
  expiresAt: number;
}

/**
 * Monta `generate <kind> <Nome> <campo:tipo> ...` a partir de entrada já validada —
 * nome e campos batem contra um padrão fechado, tipo contra um catálogo fechado, e o
 * banco (quando informado) precisa já constar em `listDatabases`. Nunca passa por shell:
 * os argumentos vão como array para `execFile`.
 */
export function buildGeneratorArgs(kind: RailsGeneratorKind, name: string, fields: RailsGeneratorField[], database?: string): string[] {
  if (!GENERATOR_NAME_PATTERN.test(name) || name.length > 60) {
    throw new RailsMutationError('RAILS_GENERATOR_INVALID_INPUT', 'Nome inválido: use letras, números e "_", começando com uma letra.');
  }
  if (fields.length > GENERATOR_MAX_FIELDS) {
    throw new RailsMutationError('RAILS_GENERATOR_INVALID_INPUT', `No máximo ${GENERATOR_MAX_FIELDS} campos.`);
  }

  const fieldArgs = fields.map((field) => {
    if (!GENERATOR_FIELD_NAME_PATTERN.test(field.name) || field.name.length > 60) {
      throw new RailsMutationError('RAILS_GENERATOR_INVALID_INPUT', `Nome de campo inválido: "${field.name}".`);
    }
    if (!GENERATOR_FIELD_TYPES.includes(field.type)) {
      throw new RailsMutationError('RAILS_GENERATOR_INVALID_INPUT', `Tipo de campo não suportado: "${field.type}".`);
    }
    return `${field.name}:${field.type}`;
  });

  const args = ['generate', kind, name, ...fieldArgs];
  if (database) args.push(`--database=${database}`);
  return args;
}

/** Rails imprime uma linha "create <caminho>" por arquivo novo gerado. */
export function parseGeneratorCreatedFiles(output: string): string[] {
  const files: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*create\s+(\S.*?)\s*$/);
    if (match?.[1]) files.push(match[1]);
  }
  return files;
}
