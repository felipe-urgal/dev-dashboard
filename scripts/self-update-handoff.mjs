import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export const SELF_UPDATE_HANDOFF_VERSION = 1;
export const SELF_UPDATE_ACTION = 'self-update';

export const SELF_UPDATE_STATUSES = Object.freeze([
  'prepared',
  'accepted',
  'applying',
  'restarting',
  'verifying',
  'succeeded',
  'failed',
  'recovery_required',
]);

const MAX_HANDOFF_BYTES = 16 * 1024;
const ACTIVE_STATUSES = new Set([
  'accepted',
  'applying',
  'restarting',
  'verifying',
]);
const TERMINAL_STATUSES = new Set([
  'succeeded',
  'failed',
  'recovery_required',
]);
const TRANSITIONS = new Map([
  ['prepared', new Set(['accepted'])],
  ['accepted', new Set(['applying', 'failed', 'recovery_required'])],
  ['applying', new Set(['restarting', 'failed', 'recovery_required'])],
  ['restarting', new Set(['verifying', 'failed', 'recovery_required'])],
  ['verifying', new Set(['succeeded', 'failed', 'recovery_required'])],
]);

const HANDOFF_ID_PATTERN = /^self-update-[0-9a-f-]{36}$/;
const REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const PLAN_HASH_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const RESULT_CODE_PATTERN = /^[A-Z0-9_]{1,96}$/;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || value.length > 64) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isResult(value) {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(
      value,
      new Set(['code', 'message', 'finishedAt', 'appliedRevision']),
    )
  ) {
    return false;
  }
  if (
    typeof value.code !== 'string' ||
    !RESULT_CODE_PATTERN.test(value.code) ||
    typeof value.message !== 'string' ||
    value.message.length < 1 ||
    value.message.length > 1000 ||
    !isIsoTimestamp(value.finishedAt)
  ) {
    return false;
  }
  return (
    value.appliedRevision === undefined ||
    (typeof value.appliedRevision === 'string' &&
      REVISION_PATTERN.test(value.appliedRevision))
  );
}

export function isSelfUpdateHandoff(value) {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(
      value,
      new Set([
        'version',
        'id',
        'action',
        'projectId',
        'targetRevision',
        'planHash',
        'status',
        'createdAt',
        'updatedAt',
        'result',
      ]),
    )
  ) {
    return false;
  }

  if (
    value.version !== SELF_UPDATE_HANDOFF_VERSION ||
    value.action !== SELF_UPDATE_ACTION ||
    typeof value.id !== 'string' ||
    !HANDOFF_ID_PATTERN.test(value.id) ||
    typeof value.projectId !== 'string' ||
    !PROJECT_ID_PATTERN.test(value.projectId) ||
    typeof value.targetRevision !== 'string' ||
    !REVISION_PATTERN.test(value.targetRevision) ||
    typeof value.planHash !== 'string' ||
    !PLAN_HASH_PATTERN.test(value.planHash) ||
    typeof value.status !== 'string' ||
    !SELF_UPDATE_STATUSES.includes(value.status) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return false;
  }

  if (TERMINAL_STATUSES.has(value.status)) return isResult(value.result);
  return value.result === undefined;
}

function assertProjectId(projectId) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error('projectId inválido para handoff de self-update.');
  }
}

function assertRevision(revision) {
  if (typeof revision !== 'string' || !REVISION_PATTERN.test(revision)) {
    throw new Error('Revision alvo inválida para handoff de self-update.');
  }
}

function assertPlanHash(planHash) {
  if (typeof planHash !== 'string' || !PLAN_HASH_PATTERN.test(planHash)) {
    throw new Error('planHash inválido para handoff de self-update.');
  }
}

function assertHandoffId(handoffId) {
  if (typeof handoffId !== 'string' || !HANDOFF_ID_PATTERN.test(handoffId)) {
    throw new Error('Identificador de handoff inválido.');
  }
}

function stateRoot() {
  return (
    process.env.DEV_DASHBOARD_STATE_DIR?.trim() ||
    path.join(homedir(), '.local', 'state', 'dev-dashboard')
  );
}

export function defaultSelfUpdateStateDirectory() {
  return path.join(stateRoot(), 'self-update');
}

async function atomicJsonWrite(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function invalidStateError(fileName) {
  return new Error(
    `Estado persistido de self-update inválido em ${fileName}; corrija ou remova o arquivo antes de continuar.`,
  );
}

export class SelfUpdateHandoffStore {
  constructor(stateDirectory = defaultSelfUpdateStateDirectory()) {
    this.stateDirectory = stateDirectory;
    this.readyPromise = this.ensureStateDirectory();
  }

  async ready() {
    await this.readyPromise;
  }

  async prepare({ projectId, targetRevision, planHash }, now = Date.now()) {
    assertProjectId(projectId);
    assertRevision(targetRevision);
    assertPlanHash(planHash);
    await this.readyPromise;

    const timestamp = new Date(now).toISOString();
    const handoff = {
      version: SELF_UPDATE_HANDOFF_VERSION,
      id: `self-update-${randomUUID()}`,
      action: SELF_UPDATE_ACTION,
      projectId,
      targetRevision,
      planHash,
      status: 'prepared',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await atomicJsonWrite(this.recordPath(handoff.id), handoff);
    return structuredClone(handoff);
  }

  async get(handoffId) {
    assertHandoffId(handoffId);
    await this.readyPromise;
    const filePath = this.recordPath(handoffId);

    let parsed;
    try {
      const metadata = await lstat(filePath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw invalidStateError(path.basename(filePath));
      }
      const content = await readFile(filePath, 'utf8');
      if (Buffer.byteLength(content, 'utf8') > MAX_HANDOFF_BYTES) {
        throw invalidStateError(path.basename(filePath));
      }
      parsed = JSON.parse(content);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }

    if (!isSelfUpdateHandoff(parsed) || parsed.id !== handoffId) {
      throw invalidStateError(path.basename(filePath));
    }
    return structuredClone(parsed);
  }

  async transition(handoffId, nextStatus, result, now = Date.now()) {
    assertHandoffId(handoffId);
    if (!SELF_UPDATE_STATUSES.includes(nextStatus)) {
      throw new Error(`Estado de self-update desconhecido: ${String(nextStatus)}.`);
    }
    const current = await this.get(handoffId);
    if (!current) throw new Error('Handoff de self-update não encontrado.');

    const allowed = TRANSITIONS.get(current.status);
    if (!allowed?.has(nextStatus)) {
      throw new Error(
        `Transição de self-update inválida: ${current.status} → ${nextStatus}.`,
      );
    }

    const updatedAt = new Date(now).toISOString();
    const next = {
      ...current,
      status: nextStatus,
      updatedAt,
    };
    if (TERMINAL_STATUSES.has(nextStatus)) {
      const terminalResult = {
        code: result?.code,
        message: result?.message,
        finishedAt: result?.finishedAt ?? updatedAt,
        ...(result?.appliedRevision
          ? { appliedRevision: result.appliedRevision }
          : {}),
      };
      if (!isResult(terminalResult)) {
        throw new Error('Resultado terminal inválido para self-update.');
      }
      next.result = terminalResult;
    }

    if (!isSelfUpdateHandoff(next)) {
      throw new Error('Transição produziu um handoff inválido.');
    }
    await atomicJsonWrite(this.recordPath(handoffId), next);
    return structuredClone(next);
  }

  async claim(handoffId, now = Date.now()) {
    return this.transition(handoffId, 'accepted', undefined, now);
  }

  async recoverInterrupted(now = Date.now()) {
    await this.readyPromise;
    const entries = await readdir(this.stateDirectory, { withFileTypes: true });
    const recovered = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const handoffId = entry.name.slice(0, -'.json'.length);
      assertHandoffId(handoffId);
      const current = await this.get(handoffId);
      if (!current || !ACTIVE_STATUSES.has(current.status)) continue;
      const next = await this.transition(
        handoffId,
        'recovery_required',
        {
          code: 'SELF_UPDATE_HELPER_INTERRUPTED',
          message:
            'O helper encontrou um self-update aceito que não possui resultado terminal persistido.',
        },
        now,
      );
      recovered.push(next);
    }

    return recovered;
  }

  async ensureStateDirectory() {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    await chmod(this.stateDirectory, 0o700);
  }

  recordPath(handoffId) {
    assertHandoffId(handoffId);
    return path.join(this.stateDirectory, `${handoffId}.json`);
  }
}
