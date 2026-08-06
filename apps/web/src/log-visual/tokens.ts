import { appendHighlightedText } from './search';

export type LogTokenKind =
  | 'controller'
  | 'duration'
  | 'env'
  | 'file'
  | 'marker'
  | 'method'
  | 'request-id'
  | 'route'
  | 'sql-keyword'
  | 'status'
  | 'url';

interface LogToken {
  kind: LogTokenKind | null;
  value: string;
}

const tokenMatchers: Array<{
  kind: LogTokenKind;
  expression: RegExp;
}> = [
  {
    kind: 'request-id',
    expression: /^\[[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\]/i,
  },
  {
    kind: 'url',
    expression: /^https?:\/\/[^\s,)]+/i,
  },
  {
    kind: 'controller',
    expression:
      /^(?:[A-Z][A-Za-z0-9_]*::)*[A-Z][A-Za-z0-9_]*Controller#[A-Za-z0-9_!?]+/,
  },
  {
    kind: 'file',
    expression:
      /^(?:(?:app|config|lib|src|pages|components|server|test|spec)\/[^\s:]+(?::\d+)?(?::in\s+[`'][^`']+[`'])?)/,
  },
  {
    kind: 'env',
    expression: /^\.env(?:\.[A-Za-z0-9_-]+)?/,
  },
  {
    kind: 'method',
    expression: /^(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/,
  },
  {
    kind: 'status',
    expression:
      /^[1-5]\d{2}(?=\s+(?:in\b|OK\b|See\b|Not\b|Internal\b|Found\b|Created\b|No\b|Moved\b|Redirect\b))/,
  },
  {
    kind: 'duration',
    expression: /^\d+(?:\.\d+)?(?:ms|s)\b/i,
  },
  {
    kind: 'sql-keyword',
    expression:
      /^(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|ORDER|GROUP|BY|HAVING|LIMIT|OFFSET|SET|VALUES|INTO|AS|IS|NULL|BEGIN|COMMIT|ROLLBACK|TRANSACTION|SAVEPOINT|RELEASE)\b/i,
  },
  {
    kind: 'route',
    expression:
      /^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%\-/]*(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?\-]*)?/,
  },
  {
    kind: 'marker',
    expression: /^(?:✓|✔|○|◌|⨯|×|<w>|<e>)/,
  },
];

function nextToken(value: string): LogToken | null {
  for (const matcher of tokenMatchers) {
    const match = value.match(matcher.expression)?.[0];
    if (match) return { kind: matcher.kind, value: match };
  }
  return null;
}

export function tokenizeLogLine(value: string): LogToken[] {
  const tokens: LogToken[] = [];
  let cursor = 0;
  let plainStart = 0;

  while (cursor < value.length) {
    const token = nextToken(value.slice(cursor));
    if (!token) {
      cursor += 1;
      continue;
    }

    if (cursor > plainStart) {
      tokens.push({ kind: null, value: value.slice(plainStart, cursor) });
    }

    tokens.push(token);
    cursor += token.value.length;
    plainStart = cursor;
  }

  if (plainStart < value.length) {
    tokens.push({ kind: null, value: value.slice(plainStart) });
  }

  return tokens.length ? tokens : [{ kind: null, value }];
}

export function appendLogSyntax(
  parent: HTMLElement,
  value: string,
  className?: string,
): HTMLElement {
  const target = className ? document.createElement('span') : parent;
  if (className) target.className = className;

  for (const token of tokenizeLogLine(value)) {
    if (!token.kind) {
      appendHighlightedText(target, token.value);
      continue;
    }

    const span = document.createElement('span');
    span.className = `log-token log-token-${token.kind}`;
    appendHighlightedText(span, token.value);
    target.append(span);
  }

  if (target !== parent) parent.append(target);
  return target;
}
