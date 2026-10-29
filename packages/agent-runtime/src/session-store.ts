import { promises as fs } from 'node:fs';
import path from 'node:path';

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export interface AgentSessionStoreOptions {
  stateDirectory: string;
}

/** Guarda a sessão do provider por task para continuar a conversa entre turnos. */
export class AgentSessionStore {
  private readonly directory: string;

  public constructor(options: AgentSessionStoreOptions) {
    this.directory = path.join(options.stateDirectory, 'sessions');
  }

  public async get(taskId: string): Promise<string | undefined> {
    const file = this.file(taskId);
    if (!file) return undefined;
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as {
        sessionId?: unknown;
      };
      return typeof parsed.sessionId === 'string' &&
        SESSION_ID_PATTERN.test(parsed.sessionId)
        ? parsed.sessionId
        : undefined;
    } catch {
      return undefined;
    }
  }

  public async set(taskId: string, sessionId: string): Promise<void> {
    const file = this.file(taskId);
    if (!file || !SESSION_ID_PATTERN.test(sessionId)) return;
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ sessionId }), {
      mode: 0o600,
    });
    await fs.rename(temporary, file);
  }

  public async clear(taskId: string): Promise<void> {
    const file = this.file(taskId);
    if (file) await fs.rm(file, { force: true });
  }

  private file(taskId: string): string | undefined {
    return TASK_ID_PATTERN.test(taskId)
      ? path.join(this.directory, `${taskId}.json`)
      : undefined;
  }
}
