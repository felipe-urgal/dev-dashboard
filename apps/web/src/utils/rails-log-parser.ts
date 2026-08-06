export type RailsLogLineKind =
  | 'request'
  | 'controller'
  | 'parameters'
  | 'sql'
  | 'source'
  | 'render'
  | 'completed'
  | 'error'
  | 'warning'
  | 'other';

export interface RailsLogLine {
  id: string;
  text: string;
  kind: RailsLogLineKind;
}

export interface RailsRequestLogGroup {
  kind: 'request';
  id: string;
  requestId: string;
  method: string | undefined;
  path: string | undefined;
  remoteAddress: string | undefined;
  startedAt: string | undefined;
  controller: string | undefined;
  action: string | undefined;
  format: string | undefined;
  parameters: string | undefined;
  status: number | undefined;
  durationMs: number | undefined;
  viewDurationMs: number | undefined;
  activeRecordDurationMs: number | undefined;
  queryCount: number | undefined;
  cachedQueries: number | undefined;
  gcDurationMs: number | undefined;
  lines: RailsLogLine[];
  sqlLines: RailsLogLine[];
  renderLines: RailsLogLine[];
  sourceLines: RailsLogLine[];
  errorLines: RailsLogLine[];
  otherLines: RailsLogLine[];
  searchableText: string;
}

export interface RailsSystemLogGroup {
  kind: 'system';
  id: string;
  lines: RailsLogLine[];
  searchableText: string;
}

export type RailsLogGroup = RailsRequestLogGroup | RailsSystemLogGroup;

export interface RailsLogSummary {
  totalRequests: number;
  successful: number;
  redirects: number;
  clientErrors: number;
  serverErrors: number;
  totalQueries: number;
  averageDurationMs: number | undefined;
  slowestDurationMs: number | undefined;
}

export interface ParsedRailsLog {
  groups: RailsLogGroup[];
  lines: RailsLogLine[];
  summary: RailsLogSummary;
}

const ansiPattern =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const orphanAnsiPattern = /\[(?:\d{1,3}(?:;\d{1,3})*)?m/g;
const requestPrefixPattern = /^\[([0-9a-f]{8}-[0-9a-f-]{20,})\]\s?/i;

export function stripAnsiSequences(value: string): string {
  return value
    .replace(ansiPattern, '')
    .replace(orphanAnsiPattern, '')
    .replace(/\r/g, '');
}

function lineKind(text: string): RailsLogLineKind {
  if (
    /\b(?:ERROR|FATAL)\b|(?:Exception|Traceback|ActionController::|ActiveRecord::)/i.test(
      text,
    )
  ) {
    return 'error';
  }

  if (/\bWARN(?:ING)?\b/i.test(text)) return 'warning';
  if (/^Started\s+[A-Z]+\s+"/i.test(text)) return 'request';
  if (/^Processing by\s+/i.test(text)) return 'controller';
  if (/^Parameters:\s*/i.test(text)) return 'parameters';
  if (/^Completed\s+\d{3}\b/i.test(text)) return 'completed';
  if (/^↳\s+/.test(text)) return 'source';
  if (/^(?:Rendering|Rendered)\s+/i.test(text)) return 'render';

  if (
    // The keyword must open the statement (optionally after a "Model Load (0.3ms)"
    // label) — matching it anywhere in the line used to misclassify unrelated
    // messages that merely contain the word, e.g. "...Controller#UPDATE, rendering...".
    /^(?:\S.*?\s+\([\d.]+ms\)\s*)?(?:SELECT|INSERT(?:\s+INTO)?|UPDATE|DELETE(?:\s+FROM)?|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT)\b/i.test(
      text,
    ) ||
    /\b(?:Load|Count|Exists\?|Create|Update|Delete|Pluck|Maximum|Minimum|Sum|Average)\s+\([\d.]+ms\)/i.test(
      text,
    )
  ) {
    return 'sql';
  }

  return 'other';
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createRequestGroup(
  requestId: string,
  index: number,
): RailsRequestLogGroup {
  return {
    kind: 'request',
    id: `request-${requestId}-${index}`,
    requestId,
    method: undefined,
    path: undefined,
    remoteAddress: undefined,
    startedAt: undefined,
    controller: undefined,
    action: undefined,
    format: undefined,
    parameters: undefined,
    status: undefined,
    durationMs: undefined,
    viewDurationMs: undefined,
    activeRecordDurationMs: undefined,
    queryCount: undefined,
    cachedQueries: undefined,
    gcDurationMs: undefined,
    lines: [],
    sqlLines: [],
    renderLines: [],
    sourceLines: [],
    errorLines: [],
    otherLines: [],
    searchableText: '',
  };
}

function appendRequestLine(
  group: RailsRequestLogGroup,
  line: RailsLogLine,
): void {
  group.lines.push(line);

  switch (line.kind) {
    case 'sql':
      group.sqlLines.push(line);
      break;
    case 'render':
      group.renderLines.push(line);
      break;
    case 'source':
      group.sourceLines.push(line);
      break;
    case 'error':
      group.errorLines.push(line);
      break;
    case 'request':
    case 'controller':
    case 'parameters':
    case 'completed':
      break;
    default:
      group.otherLines.push(line);
  }
}

function enrichRequestGroup(group: RailsRequestLogGroup, text: string): void {
  const started = text.match(
    /^Started\s+([A-Z]+)\s+"([^"]+)"\s+for\s+(.+?)\s+at\s+(.+)$/i,
  );

  if (started) {
    group.method = started[1]?.toUpperCase();
    group.path = started[2];
    group.remoteAddress = started[3];
    group.startedAt = started[4];
    return;
  }

  const processing = text.match(
    /^Processing by\s+(.+?)#([^\s]+)\s+as\s+(.+)$/i,
  );
  if (processing) {
    group.controller = processing[1];
    group.action = processing[2];
    group.format = processing[3];
    return;
  }

  const parameters = text.match(/^Parameters:\s*(.+)$/i);
  if (parameters) {
    group.parameters = parameters[1];
    return;
  }

  const completed = text.match(
    /^Completed\s+(\d{3})\b.*?\s+in\s+([\d.]+)ms\s*(?:\((.*)\))?$/i,
  );
  if (!completed) return;

  group.status = Number(completed[1]);
  group.durationMs = parseNumber(completed[2]);

  const details = completed[3] ?? '';
  group.viewDurationMs = parseNumber(
    details.match(/Views:\s*([\d.]+)ms/i)?.[1],
  );
  group.activeRecordDurationMs = parseNumber(
    details.match(/ActiveRecord:\s*([\d.]+)ms/i)?.[1],
  );
  group.gcDurationMs = parseNumber(details.match(/GC:\s*([\d.]+)ms/i)?.[1]);
  group.queryCount = parseNumber(details.match(/\((\d+)\s+queries?/i)?.[1]);
  group.cachedQueries = parseNumber(
    details.match(/,\s*(\d+)\s+cached\)/i)?.[1],
  );

  if ((group.status ?? 0) >= 500 && !group.errorLines.length) {
    group.errorLines.push({
      id: `${group.id}-status-error`,
      text,
      kind: 'error',
    });
  }
}

function buildSummary(groups: RailsLogGroup[]): RailsLogSummary {
  const requests = groups.filter(
    (group): group is RailsRequestLogGroup => group.kind === 'request',
  );
  const durations = requests
    .map((request) => request.durationMs)
    .filter((duration): duration is number => duration !== undefined);

  return {
    totalRequests: requests.length,
    successful: requests.filter(
      (request) => (request.status ?? 0) >= 200 && (request.status ?? 0) < 300,
    ).length,
    redirects: requests.filter(
      (request) => (request.status ?? 0) >= 300 && (request.status ?? 0) < 400,
    ).length,
    clientErrors: requests.filter(
      (request) => (request.status ?? 0) >= 400 && (request.status ?? 0) < 500,
    ).length,
    serverErrors: requests.filter((request) => (request.status ?? 0) >= 500)
      .length,
    totalQueries: requests.reduce(
      (total, request) => total + (request.queryCount ?? 0),
      0,
    ),
    averageDurationMs: durations.length
      ? durations.reduce((total, duration) => total + duration, 0) /
        durations.length
      : undefined,
    slowestDurationMs: durations.length ? Math.max(...durations) : undefined,
  };
}

export function parseRailsLog(content: string): ParsedRailsLog {
  const cleanedLines = stripAnsiSequences(content)
    .split('\n')
    .filter(
      (line, index, lines) => line.length > 0 || index < lines.length - 1,
    );

  const groups: RailsLogGroup[] = [];
  const lines: RailsLogLine[] = [];
  const requestsById = new Map<string, RailsRequestLogGroup>();
  let systemGroup: RailsSystemLogGroup | undefined;

  cleanedLines.forEach((rawLine, index) => {
    const prefix = rawLine.match(requestPrefixPattern);
    const requestId = prefix?.[1];
    const text = prefix ? rawLine.slice(prefix[0].length).trimStart() : rawLine;
    const parsedLine: RailsLogLine = {
      id: `line-${index}`,
      text,
      kind: lineKind(text),
    };

    lines.push(parsedLine);

    if (!requestId) {
      if (!systemGroup) {
        systemGroup = {
          kind: 'system',
          id: `system-${index}`,
          lines: [],
          searchableText: '',
        };
        groups.push(systemGroup);
      }

      systemGroup.lines.push(parsedLine);
      return;
    }

    systemGroup = undefined;
    let requestGroup = requestsById.get(requestId);

    if (!requestGroup) {
      requestGroup = createRequestGroup(requestId, index);
      requestsById.set(requestId, requestGroup);
      groups.push(requestGroup);
    }

    appendRequestLine(requestGroup, parsedLine);
    enrichRequestGroup(requestGroup, text);
  });

  groups.forEach((group) => {
    group.searchableText = group.lines
      .map((line) => line.text)
      .join('\n')
      .toLowerCase();
  });

  return {
    groups,
    lines,
    summary: buildSummary(groups),
  };
}

export function railsRequestStatusTone(
  status: number | undefined,
): 'success' | 'redirect' | 'warning' | 'error' | 'neutral' {
  if (status === undefined) return 'neutral';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'warning';
  if (status >= 500) return 'error';
  return 'neutral';
}
