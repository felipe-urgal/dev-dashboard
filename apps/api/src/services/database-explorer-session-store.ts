import { randomUUID } from 'node:crypto';

import type { MachineDatabaseConnection } from '@dev-dashboard/contracts';

export const DATABASE_EXPLORER_SESSION_TTL_MS = 15 * 60 * 1000;

export interface DatabaseExplorerSessionDescriptor {
  sessionId: string;
  expiresAt: string;
}

interface DatabaseExplorerSessionRecord {
  connection: MachineDatabaseConnection;
  expiresAtMs: number;
  timeout: ReturnType<typeof setTimeout>;
}

export interface DatabaseExplorerSessionStoreOptions {
  ttlMs?: number;
  now?: () => number;
  generateSessionId?: () => string;
}

export class DatabaseExplorerSessionStore {
  private readonly sessions = new Map<string, DatabaseExplorerSessionRecord>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly generateSessionId: () => string;

  public constructor(options: DatabaseExplorerSessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DATABASE_EXPLORER_SESSION_TTL_MS;
    this.now = options.now ?? Date.now;
    this.generateSessionId = options.generateSessionId ?? randomUUID;

    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new Error('O TTL da sessão do Database Explorer deve ser positivo.');
    }
  }

  create(
    connection: MachineDatabaseConnection,
  ): DatabaseExplorerSessionDescriptor {
    const sessionId = this.generateUniqueSessionId();
    const expiresAtMs = this.now() + this.ttlMs;
    const timeout = setTimeout(() => {
      this.sessions.delete(sessionId);
    }, this.ttlMs);
    timeout.unref?.();

    this.sessions.set(sessionId, {
      connection: { ...connection },
      expiresAtMs,
      timeout,
    });

    return {
      sessionId,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  get(sessionId: string): MachineDatabaseConnection | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    if (session.expiresAtMs <= this.now()) {
      this.removeRecord(sessionId, session);
      return undefined;
    }

    return { ...session.connection };
  }

  delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.removeRecord(sessionId, session);
    return true;
  }

  close(): void {
    for (const [sessionId, session] of this.sessions) {
      this.removeRecord(sessionId, session);
    }
  }

  private generateUniqueSessionId(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sessionId = this.generateSessionId();
      if (sessionId && !this.sessions.has(sessionId)) return sessionId;
    }
    throw new Error('Não foi possível gerar uma sessão única do Database Explorer.');
  }

  private removeRecord(
    sessionId: string,
    session: DatabaseExplorerSessionRecord,
  ): void {
    clearTimeout(session.timeout);
    this.sessions.delete(sessionId);
  }
}
