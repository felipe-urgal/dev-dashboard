import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import {
  findGitMutationCatalogEntry,
  type GitMutationHistoryEvent,
  type GitMutationHistoryPage,
  type GitMutationHistoryResult,
} from '@dev-dashboard/contracts';

const HISTORY_VERSION = 1;
const PROJECT_EVENT_LIMIT = 200;
const GLOBAL_EVENT_LIMIT = 2000;
const DEFAULT_PAGE_SIZE = 20;

interface StoredHistory {
  version: 1;
  events: GitMutationHistoryEvent[];
}

const RESULT_VALUES: readonly GitMutationHistoryResult[] = ['succeeded', 'failed'];
const RISK_VALUES = ['read-only', 'write-safe', 'write-remote', 'destructive'];

function isValidEvent(value: unknown): value is GitMutationHistoryEvent {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' && item.id.length > 0
    && typeof item.projectId === 'string' && item.projectId.length > 0
    && (item.workspaceId === undefined || typeof item.workspaceId === 'string')
    && typeof item.operationId === 'string' && item.operationId.length > 0
    && RISK_VALUES.includes(String(item.risk))
    && typeof item.occurredAt === 'string' && Number.isFinite(Date.parse(item.occurredAt))
    && RESULT_VALUES.includes(item.result as GitMutationHistoryResult)
    && (item.errorCode === undefined || typeof item.errorCode === 'string')
  );
}

/**
 * Reduz o histórico às regras da política inicial: no máximo
 * `PROJECT_EVENT_LIMIT` eventos por projeto e `GLOBAL_EVENT_LIMIT` no total.
 * `events` já está ordenado do mais novo para o mais antigo — a primeira
 * ocorrência de cada projeto dentro do limite global é sempre preservada.
 */
function enforceLimits(events: readonly GitMutationHistoryEvent[]): GitMutationHistoryEvent[] {
  const perProjectCount = new Map<string, number>();
  const kept: GitMutationHistoryEvent[] = [];
  for (const event of events) {
    if (kept.length >= GLOBAL_EVENT_LIMIT) break;
    const count = perProjectCount.get(event.projectId) ?? 0;
    if (count >= PROJECT_EVENT_LIMIT) continue;
    perProjectCount.set(event.projectId, count + 1);
    kept.push(event);
  }
  return kept;
}

export interface RecordGitMutationHistoryInput {
  projectId: string;
  workspaceId?: string;
  /** Identificador do catálogo (`GitMutationCatalogEntry.id`). */
  operationId: string;
  result: GitMutationHistoryResult;
  /** Código de erro controlado; presente apenas quando `result` é `'failed'`. */
  errorCode?: string;
}

/**
 * Histórico persistente e limitado dos resultados de mutações Git.
 *
 * Guarda somente metadados operacionais — nunca mensagem de commit, nome
 * sensível, caminho, patch, stdout/stderr ou token de confirmação — em um
 * único arquivo JSON versionado, gravado atomicamente (arquivo temporário +
 * `rename`), com permissões restritas ao usuário (diretório `0700`, arquivo
 * `0600`), no mesmo espírito de `TestExecutionHistoryService`.
 *
 * `record` nunca lança: uma falha ao persistir é registrada no log interno
 * do processo e não deve transformar uma mutação bem-sucedida em falha
 * percebida pelo chamador.
 */
export class GitMutationHistoryService {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(
    stateDirectory = process.env.DEV_DASHBOARD_STATE_DIR?.trim()
      || path.join(homedir(), '.local', 'state', 'dev-dashboard'),
  ) {
    this.filePath = path.join(path.resolve(stateDirectory, 'git-mutation-history'), 'events.json');
  }

  public async record(input: RecordGitMutationHistoryInput): Promise<void> {
    const catalogEntry = findGitMutationCatalogEntry(input.operationId);
    const event: GitMutationHistoryEvent = {
      id: randomUUID(),
      projectId: input.projectId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      operationId: input.operationId,
      risk: catalogEntry?.risk ?? 'write-safe',
      occurredAt: new Date().toISOString(),
      result: input.result,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    };

    // As gravações são serializadas em fila para evitar leituras/gravações
    // concorrentes do mesmo arquivo. Erros são capturados aqui dentro — o
    // método nunca rejeita, mesmo que a persistência falhe.
    this.writeQueue = this.writeQueue.then(() => this.appendLocked(event));
    await this.writeQueue;
  }

  private async appendLocked(event: GitMutationHistoryEvent): Promise<void> {
    try {
      const items = await this.load();
      items.unshift(event);
      await this.save(enforceLimits(items));
    } catch (error) {
      console.error('[git-mutation-history] falha ao registrar evento de mutação Git', error);
    }
  }

  public async history(
    projectId: string,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<GitMutationHistoryPage> {
    const events = (await this.load()).filter((event) => event.projectId === projectId);
    const total = events.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const effectivePage = totalPages === 0 ? 1 : Math.min(Math.max(1, Math.floor(page)), totalPages);
    const start = (effectivePage - 1) * pageSize;
    return {
      projectId,
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      events: events.slice(start, start + pageSize),
    };
  }

  private async load(): Promise<GitMutationHistoryEvent[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredHistory>;
      if (parsed.version !== HISTORY_VERSION || !Array.isArray(parsed.events)) return [];
      return parsed.events.filter(isValidEvent);
    } catch {
      return [];
    }
  }

  private async save(events: GitMutationHistoryEvent[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    const stored: StoredHistory = { version: HISTORY_VERSION, events };
    await writeFile(temporary, JSON.stringify(stored), { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
