import { randomBytes } from 'node:crypto';

import type {
  Project,
  ProjectScript,
  ScriptExecutionConfirmation,
  ScriptExecutionVariables,
} from '@dev-dashboard/contracts';

import { tokensMatch } from './auth.js';
import { CONFIRMATION_TTL_MS } from './constants.js';
import { isProtectedScriptEnvironmentVariable } from './environment-variables.js';
import { ScriptExecutionError } from './errors.js';
import type { ScriptExecutionContext, StoredConfirmation } from './state.js';

/**
 * Autorização de mutações: catálogo fechado de ações (`findEnabledAction`),
 * validação de variáveis declaradas (`normalizeVariables`) e o token de
 * confirmação de uso único vinculado a projeto + ação + assinatura das
 * variáveis (`prepareScriptConfirmation`/`consumeConfirmation`) — ações
 * somente leitura nunca passam por aqui.
 */

export async function findEnabledAction(
  detection: ScriptExecutionContext['detection'],
  project: Project,
  actionId: string,
): Promise<ProjectScript> {
  const action = await detection.findAction(project, actionId);
  if (!action) {
    throw new ScriptExecutionError(
      'SCRIPT_NOT_FOUND',
      'A ação não existe no catálogo atual.',
    );
  }
  if (!action.enabled) {
    throw new ScriptExecutionError(
      'SCRIPT_DISABLED',
      'Ações destrutivas permanecem bloqueadas.',
    );
  }
  return action;
}

export function normalizeVariables(
  action: ProjectScript,
  received: ScriptExecutionVariables,
): ScriptExecutionVariables {
  const declared = action.variables ?? [];
  const entries = Object.entries(received);
  if (entries.length > 20) {
    throw new ScriptExecutionError(
      'SCRIPT_VARIABLES_INVALID',
      'A tarefa aceita no máximo 20 variáveis.',
    );
  }
  const allowed = new Map(
    declared.map((variable) => [variable.name, variable]),
  );
  const normalized: ScriptExecutionVariables = {};
  for (const [name, value] of entries) {
    if (
      isProtectedScriptEnvironmentVariable(name) ||
      !allowed.has(name) ||
      typeof value !== 'string'
    ) {
      throw new ScriptExecutionError(
        'SCRIPT_VARIABLES_INVALID',
        'A requisição contém uma variável não aceita pela tarefa atual.',
      );
    }
    if (value.length > 4_096 || /[\0\r\n]/.test(value)) {
      throw new ScriptExecutionError(
        'SCRIPT_VARIABLES_INVALID',
        `O valor de ${name} é inválido ou excede 4 KiB.`,
      );
    }
    if (value !== '') normalized[name] = value;
  }
  for (const variable of declared) {
    if (variable.required && normalized[variable.name] === undefined) {
      throw new ScriptExecutionError(
        'SCRIPT_VARIABLES_INVALID',
        `Informe a variável obrigatória ${variable.name}.`,
      );
    }
  }
  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

export function variablesSignature(
  variables: ScriptExecutionVariables,
): string {
  return JSON.stringify(variables);
}

export async function prepareScriptConfirmation(
  context: ScriptExecutionContext,
  project: Project,
  actionId: string,
  receivedVariables: ScriptExecutionVariables = {},
): Promise<ScriptExecutionConfirmation> {
  const action = await findEnabledAction(context.detection, project, actionId);
  const variables = normalizeVariables(action, receivedVariables);
  if (action.risk === 'read-only') {
    throw new ScriptExecutionError(
      'SCRIPT_CONFIRMATION_REQUIRED',
      'Ações somente leitura não precisam de confirmação.',
    );
  }

  const confirmation: StoredConfirmation = {
    token: randomBytes(32).toString('hex'),
    projectId: project.id,
    actionId: action.id,
    expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
    variablesSignature: variablesSignature(variables),
  };
  context.confirmations.set(confirmation.token, confirmation);
  return {
    token: confirmation.token,
    actionId: confirmation.actionId,
    expiresAt: confirmation.expiresAt,
  };
}

export function consumeConfirmation(
  context: ScriptExecutionContext,
  projectId: string,
  actionId: string,
  signature: string,
  receivedToken?: string,
): void {
  const stored = receivedToken
    ? context.confirmations.get(receivedToken)
    : undefined;
  if (receivedToken) {
    context.confirmations.delete(receivedToken);
  }
  if (
    !receivedToken ||
    !stored ||
    !tokensMatch(receivedToken, stored.token) ||
    stored.projectId !== projectId ||
    stored.actionId !== actionId ||
    stored.variablesSignature !== signature ||
    Date.parse(stored.expiresAt) <= Date.now()
  ) {
    throw new ScriptExecutionError(
      'SCRIPT_CONFIRMATION_REQUIRED',
      'Solicite e confirme uma autorização nova para esta ação.',
    );
  }
}
