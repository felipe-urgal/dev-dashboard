import { highlightGenericLine } from './generic-line';
import { renderText, renderToken } from './render-text';
import { quotedEnd } from './tokenize-helpers';

function highlightAttributes(value: string, query: string): string {
  let cursor = 0;
  let result = '';
  while (cursor < value.length) {
    const rest = value.slice(cursor);
    const whitespace = rest.match(/^\s+/)?.[0];
    if (whitespace) {
      result += renderText(whitespace, query);
      cursor += whitespace.length;
      continue;
    }
    const current = value[cursor] ?? '';
    if (current === '"' || current === "'") {
      const end = quotedEnd(value, cursor);
      result += renderToken('string', value.slice(cursor, end), query);
      cursor = end;
      continue;
    }
    const attribute = rest.match(/^[:@#A-Za-z_][\w:.-]*/)?.[0];
    if (attribute) {
      result += renderToken('attribute', attribute, query);
      cursor += attribute.length;
      continue;
    }
    const operator = rest.match(/^(?:=|\/?>|\{|\}|\(|\)|\[|\])/)?.[0];
    if (operator) {
      result += renderToken('operator', operator, query);
      cursor += operator.length;
      continue;
    }
    result += renderText(current, query);
    cursor += 1;
  }
  return result;
}

export function highlightMarkupLine(line: string, query: string): string {
  let cursor = 0;
  let result = '';
  const expression = /<!--.*?-->|<%=?[\s\S]*?%>|<\/?[A-Za-z][^<>]*?>/g;

  for (const match of line.matchAll(expression)) {
    const start = match.index ?? 0;
    result += renderText(line.slice(cursor, start), query);
    const value = match[0] ?? '';

    if (value.startsWith('<!--')) {
      result += renderToken('comment', value, query);
    } else if (value.startsWith('<%')) {
      const opening = value.startsWith('<%=') ? '<%=' : '<%';
      const body = value.slice(opening.length, -2);
      result += renderToken('operator', opening, query);
      result += highlightGenericLine(body, 'ruby', query);
      result += renderToken('operator', '%>', query);
    } else {
      const tag = value.match(/^(<\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?>)$/);
      if (!tag) result += renderText(value, query);
      else {
        result += renderToken('operator', tag[1] ?? '<', query);
        result += renderToken('tag', tag[2] ?? '', query);
        result += highlightAttributes(tag[3] ?? '', query);
        result += renderToken('operator', tag[4] ?? '>', query);
      }
    }
    cursor = start + value.length;
  }

  return result + renderText(line.slice(cursor), query);
}
