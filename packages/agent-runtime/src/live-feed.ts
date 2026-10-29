import type { AgentLiveEvent, AgentLiveEventInput } from './contracts.js';

const DEFAULT_MAX_EVENTS_PER_TASK = 300;
const DEFAULT_MAX_TASKS = 50;

export interface AgentLiveFeedOptions {
  maxEventsPerTask?: number;
  maxTasks?: number;
  now?: () => string;
}

interface TaskFeed {
  seq: number;
  events: AgentLiveEvent[];
}

/**
 * Progresso ao vivo das execuções, só em memória: serve para a tela acompanhar
 * o que o Claude está fazendo. O histórico durável continua na conversa/auditoria.
 */
export class AgentLiveFeed {
  private readonly feeds = new Map<string, TaskFeed>();
  private readonly maxEvents: number;
  private readonly maxTasks: number;
  private readonly now: () => string;

  public constructor(options: AgentLiveFeedOptions = {}) {
    this.maxEvents = options.maxEventsPerTask ?? DEFAULT_MAX_EVENTS_PER_TASK;
    this.maxTasks = options.maxTasks ?? DEFAULT_MAX_TASKS;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Nova execução: começa um feed limpo para a task. */
  public reset(taskId: string): void {
    this.feeds.delete(taskId);
    this.feed(taskId);
  }

  public append(taskId: string, input: AgentLiveEventInput): void {
    const feed = this.feed(taskId);
    feed.seq += 1;
    feed.events.push({
      seq: feed.seq,
      at: this.now(),
      kind: input.kind,
      text: input.text,
      ...(input.tool ? { tool: input.tool } : {}),
    });
    if (feed.events.length > this.maxEvents) {
      feed.events.splice(0, feed.events.length - this.maxEvents);
    }
  }

  public list(taskId: string, afterSeq = 0): AgentLiveEvent[] {
    const feed = this.feeds.get(taskId);
    if (!feed) return [];
    return feed.events
      .filter((event) => event.seq > afterSeq)
      .map((event) => ({ ...event }));
  }

  private feed(taskId: string): TaskFeed {
    let feed = this.feeds.get(taskId);
    if (!feed) {
      feed = { seq: 0, events: [] };
      this.feeds.set(taskId, feed);
      if (this.feeds.size > this.maxTasks) {
        const oldest = this.feeds.keys().next().value;
        if (oldest !== undefined) this.feeds.delete(oldest);
      }
    }
    return feed;
  }
}
