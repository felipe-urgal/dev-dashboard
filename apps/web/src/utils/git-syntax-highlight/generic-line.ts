import { FUNCTION_DECLARATIONS, KEYWORDS, LITERALS, TYPE_DECLARATIONS } from './keywords';
import { renderText, renderToken } from './render-text';
import { commentMarker, nextNonWhitespace, quotedEnd } from './tokenize-helpers';
import type { GitSyntaxLanguage, SyntaxTokenKind } from './types';

export function highlightGenericLine(
  line: string,
  language: GitSyntaxLanguage,
  query: string,
): string {
  let cursor = 0;
  let result = '';
  let firstCodeToken = true;
  let expectedDeclaration: 'function' | 'type' | null = null;
  let previousSignificant = '';

  while (cursor < line.length) {
    const rest = line.slice(cursor);
    const whitespace = rest.match(/^\s+/)?.[0];
    if (whitespace) {
      result += renderText(whitespace, query);
      cursor += whitespace.length;
      continue;
    }

    const marker = commentMarker(language, line, cursor);
    if (marker) {
      result += renderToken('comment', rest, query);
      break;
    }

    const current = line[cursor] ?? '';
    if (current === '"' || current === "'" || current === '`') {
      const end = quotedEnd(line, cursor);
      result += renderToken('string', line.slice(cursor, end), query);
      previousSignificant = 'string';
      firstCodeToken = false;
      cursor = end;
      continue;
    }

    if (language === 'ruby') {
      const symbol = rest.match(/^:[A-Za-z_][A-Za-z0-9_]*[!?=]?/)?.[0];
      if (symbol) {
        result += renderToken('symbol', symbol, query);
        previousSignificant = symbol;
        firstCodeToken = false;
        cursor += symbol.length;
        continue;
      }
    }

    const variable = rest.match(/^(?:@@?[A-Za-z_][A-Za-z0-9_]*[!?=]?|\$[A-Za-z_][A-Za-z0-9_]*)/)?.[0];
    if (variable) {
      result += renderToken('variable', variable, query);
      previousSignificant = variable;
      firstCodeToken = false;
      cursor += variable.length;
      continue;
    }

    const number = rest.match(/^(?:0x[\da-f]+|0b[01]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i)?.[0];
    if (number) {
      result += renderToken('number', number, query);
      previousSignificant = number;
      firstCodeToken = false;
      cursor += number.length;
      continue;
    }

    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_$]*[!?=]?/)?.[0];
    if (identifier) {
      const normalized = identifier.toLocaleLowerCase('en-US');
      const keywords = KEYWORDS[language] ?? KEYWORDS.generic;
      const next = nextNonWhitespace(line, cursor + identifier.length);
      let kind: SyntaxTokenKind | null = null;

      if (keywords.has(identifier) || keywords.has(normalized)) {
        kind = normalized === 'self' || normalized === 'this' ? 'variable' : 'keyword';
        if (FUNCTION_DECLARATIONS.has(normalized)) expectedDeclaration = 'function';
        else if (TYPE_DECLARATIONS.has(normalized)) expectedDeclaration = 'type';
      } else if (LITERALS.has(normalized)) {
        kind = 'literal';
      } else if (expectedDeclaration === 'function') {
        kind = 'function';
        expectedDeclaration = null;
      } else if (expectedDeclaration === 'type') {
        kind = 'type';
        expectedDeclaration = null;
      } else if (/^[A-Z]/.test(identifier)) {
        kind = 'type';
      } else if (
        next === ':'
        && ['css', 'javascript', 'json', 'typescript', 'yaml'].includes(language)
      ) {
        kind = 'property';
      } else if (next === '(') {
        kind = 'function';
      } else if ((previousSignificant === '.' || previousSignificant === '::') && language === 'ruby') {
        kind = 'function';
      } else if (
        firstCodeToken
        && language === 'ruby'
        && next !== '='
        && next !== ':'
        && next !== '=>'
      ) {
        kind = 'function';
      } else if (firstCodeToken && language === 'shell') {
        kind = 'function';
      }

      result += renderToken(kind, identifier, query);
      previousSignificant = identifier;
      firstCodeToken = false;
      cursor += identifier.length;
      continue;
    }

    const operator = rest.match(/^(?:::|===|!==|=>|==|!=|<=|>=|&&|\|\||\*\*|\.\.\.?|[-+*/%=<>!&|^~?:.,;()[\]{}])/)?.[0];
    if (operator) {
      result += renderToken('operator', operator, query);
      previousSignificant = operator;
      cursor += operator.length;
      continue;
    }

    result += renderText(current, query);
    previousSignificant = current;
    firstCodeToken = false;
    cursor += 1;
  }

  return result;
}
