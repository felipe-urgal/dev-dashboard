export type GitSyntaxLanguage =
  | 'css'
  | 'generic'
  | 'html'
  | 'java'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'php'
  | 'python'
  | 'ruby'
  | 'rust'
  | 'shell'
  | 'sql'
  | 'typescript'
  | 'vue'
  | 'yaml';

type SyntaxTokenKind =
  | 'attribute'
  | 'comment'
  | 'function'
  | 'keyword'
  | 'literal'
  | 'number'
  | 'operator'
  | 'property'
  | 'selector'
  | 'string'
  | 'symbol'
  | 'tag'
  | 'type'
  | 'variable';

const EXTENSION_LANGUAGES: Record<string, GitSyntaxLanguage> = {
  bash: 'shell',
  cjs: 'javascript',
  css: 'css',
  erb: 'html',
  gemspec: 'ruby',
  haml: 'ruby',
  htm: 'html',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'javascript',
  kt: 'java',
  kts: 'java',
  less: 'css',
  md: 'markdown',
  mdx: 'markdown',
  mjs: 'javascript',
  php: 'php',
  py: 'python',
  rake: 'ruby',
  rb: 'ruby',
  rs: 'rust',
  sass: 'css',
  scss: 'css',
  sh: 'shell',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'vue',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'shell',
};

const FILE_LANGUAGES: Record<string, GitSyntaxLanguage> = {
  dockerfile: 'shell',
  gemfile: 'ruby',
  procfile: 'shell',
  rakefile: 'ruby',
};

const KEYWORDS: Record<GitSyntaxLanguage, ReadonlySet<string>> = {
  css: new Set(['and', 'from', 'important', 'not', 'only', 'or', 'to']),
  generic: new Set(['as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'do', 'else', 'enum', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'interface', 'let', 'new', 'of', 'private', 'protected', 'public', 'return', 'static', 'switch', 'throw', 'try', 'type', 'var', 'while', 'yield']),
  html: new Set(),
  java: new Set(['abstract', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while']),
  javascript: new Set(['as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'from', 'function', 'get', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'set', 'static', 'super', 'switch', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield']),
  json: new Set(),
  markdown: new Set(),
  php: new Set(['abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone', 'const', 'continue', 'declare', 'default', 'do', 'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach', 'endif', 'endswitch', 'endwhile', 'enum', 'eval', 'exit', 'extends', 'final', 'finally', 'fn', 'for', 'foreach', 'function', 'global', 'goto', 'if', 'implements', 'include', 'include_once', 'instanceof', 'interface', 'isset', 'list', 'match', 'namespace', 'new', 'or', 'print', 'private', 'protected', 'public', 'readonly', 'require', 'require_once', 'return', 'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'xor', 'yield']),
  python: new Set(['and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']),
  ruby: new Set(['BEGIN', 'END', 'alias', 'and', 'begin', 'break', 'case', 'class', 'def', 'defined?', 'do', 'else', 'elsif', 'end', 'ensure', 'for', 'if', 'in', 'include', 'module', 'next', 'not', 'or', 'prepend', 'private', 'protected', 'public', 'redo', 'rescue', 'retry', 'return', 'self', 'super', 'then', 'undef', 'unless', 'until', 'when', 'while', 'yield']),
  rust: new Set(['as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'type', 'unsafe', 'use', 'where', 'while']),
  shell: new Set(['case', 'do', 'done', 'elif', 'else', 'esac', 'export', 'fi', 'for', 'function', 'if', 'in', 'local', 'readonly', 'select', 'then', 'time', 'until', 'while']),
  sql: new Set(['add', 'all', 'alter', 'and', 'as', 'asc', 'begin', 'between', 'by', 'case', 'check', 'column', 'commit', 'constraint', 'create', 'database', 'default', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'exists', 'foreign', 'from', 'full', 'group', 'having', 'in', 'index', 'inner', 'insert', 'into', 'is', 'join', 'key', 'left', 'like', 'limit', 'not', 'null', 'on', 'or', 'order', 'outer', 'primary', 'references', 'returning', 'right', 'rollback', 'select', 'set', 'table', 'then', 'union', 'unique', 'update', 'values', 'view', 'when', 'where', 'with']),
  typescript: new Set(['abstract', 'any', 'as', 'asserts', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'constructor', 'continue', 'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface', 'is', 'keyof', 'let', 'module', 'namespace', 'never', 'new', 'of', 'override', 'private', 'protected', 'public', 'readonly', 'return', 'satisfies', 'set', 'static', 'super', 'switch', 'throw', 'try', 'type', 'typeof', 'unknown', 'var', 'void', 'while', 'with', 'yield']),
  vue: new Set(),
  yaml: new Set(),
};

const LITERALS = new Set([
  'false',
  'nil',
  'null',
  'none',
  'true',
  'undefined',
]);

const FUNCTION_DECLARATIONS = new Set(['def', 'fn', 'function']);
const TYPE_DECLARATIONS = new Set(['class', 'enum', 'interface', 'module', 'namespace', 'struct', 'trait', 'type']);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderText(value: string, query: string): string {
  const normalized = query.trim();
  if (!normalized) return escapeHtml(value);

  const expression = new RegExp(escapeRegExp(normalized), 'gi');
  let cursor = 0;
  let result = '';
  for (const match of value.matchAll(expression)) {
    const start = match.index ?? 0;
    result += escapeHtml(value.slice(cursor, start));
    result += `<mark>${escapeHtml(match[0] ?? '')}</mark>`;
    cursor = start + (match[0]?.length ?? 0);
  }
  return result + escapeHtml(value.slice(cursor));
}

function renderToken(kind: SyntaxTokenKind | null, value: string, query: string): string {
  const content = renderText(value, query);
  return kind ? `<span class="git-syntax-${kind}">${content}</span>` : content;
}

function extensionFromPath(filePath: string): string {
  const cleanPath = filePath.split(/[?#]/, 1)[0] ?? filePath;
  const fileName = cleanPath.split('/').filter(Boolean).at(-1)?.toLocaleLowerCase('en-US') ?? '';
  if (FILE_LANGUAGES[fileName]) return fileName;
  return fileName.includes('.') ? fileName.split('.').at(-1) ?? '' : '';
}

export function gitSyntaxLanguageForPath(filePath: string): GitSyntaxLanguage {
  const cleanPath = filePath.split(/[?#]/, 1)[0] ?? filePath;
  const fileName = cleanPath.split('/').filter(Boolean).at(-1)?.toLocaleLowerCase('en-US') ?? '';
  if (FILE_LANGUAGES[fileName]) return FILE_LANGUAGES[fileName]!;
  if (fileName.endsWith('.html.erb')) return 'html';
  return EXTENSION_LANGUAGES[extensionFromPath(filePath)] ?? 'generic';
}

function commentMarker(language: GitSyntaxLanguage, line: string, cursor: number): string | null {
  const rest = line.slice(cursor);
  if (language === 'ruby' || language === 'python' || language === 'shell' || language === 'yaml') {
    return rest.startsWith('#') ? '#' : null;
  }
  if (language === 'sql') {
    if (rest.startsWith('--')) return '--';
    if (rest.startsWith('/*')) return '/*';
    return null;
  }
  if (language === 'css') return rest.startsWith('/*') ? '/*' : null;
  if (['generic', 'java', 'javascript', 'php', 'rust', 'typescript', 'vue'].includes(language)) {
    if (rest.startsWith('//')) return '//';
    if (rest.startsWith('/*')) return '/*';
  }
  return null;
}

function quotedEnd(line: string, cursor: number): number {
  const quote = line[cursor];
  let index = cursor + 1;
  while (index < line.length) {
    if (line[index] === '\\') {
      index += 2;
      continue;
    }
    if (line[index] === quote) return index + 1;
    index += 1;
  }
  return line.length;
}

function nextNonWhitespace(line: string, cursor: number): string {
  return line.slice(cursor).match(/^\s*(::|=>|===|!==|==|!=|<=|>=|&&|\|\||.)/)?.[1] ?? '';
}

function highlightGenericLine(
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

function highlightMarkupLine(line: string, query: string): string {
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

function highlightMarkdownLine(line: string, query: string): string {
  const heading = line.match(/^(\s*)(#{1,6})(\s+)(.*)$/);
  if (heading) {
    return renderText(heading[1] ?? '', query)
      + renderToken('keyword', heading[2] ?? '', query)
      + renderText(heading[3] ?? '', query)
      + renderToken('type', heading[4] ?? '', query);
  }
  if (/^\s*>/.test(line)) return renderToken('comment', line, query);
  return highlightGenericLine(line, 'generic', query);
}

export function highlightGitDiffCode(
  text: string,
  filePath: string,
  query = '',
): string {
  const language = gitSyntaxLanguageForPath(filePath);
  if (language === 'html') return highlightMarkupLine(text, query);
  if (language === 'vue') {
    return /<\/?[A-Za-z]|<%/.test(text)
      ? highlightMarkupLine(text, query)
      : highlightGenericLine(text, 'typescript', query);
  }
  if (language === 'markdown') return highlightMarkdownLine(text, query);
  return highlightGenericLine(text, language, query);
}

function pathFromDiffHeader(line: string): string | null {
  const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (header?.[2]) return header[2];
  const target = line.match(/^\+\+\+ b\/(.+)$/);
  return target?.[1] ?? null;
}

export function highlightGitPatch(patch: string, query = ''): string {
  let filePath = '';
  return patch.split('\n').map((line) => {
    filePath = pathFromDiffHeader(line) ?? filePath;
    let kind = 'meta';
    let prefix = '';
    let body = line;

    if (line.startsWith('@@')) kind = 'hunk';
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      kind = 'addition';
      prefix = '+';
      body = line.slice(1);
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      kind = 'deletion';
      prefix = '−';
      body = line.slice(1);
    } else if (line.startsWith(' ')) {
      kind = 'context';
      prefix = ' ';
      body = line.slice(1);
    } else if (line.startsWith('\\ No newline')) {
      kind = 'notice';
    }

    const code = kind === 'addition' || kind === 'deletion' || kind === 'context'
      ? highlightGitDiffCode(body, filePath, query)
      : renderText(body, query);
    return `<span class="git-syntax-patch-line is-${kind}"><span class="git-syntax-patch-prefix">${renderText(prefix, query)}</span><span class="git-syntax-patch-code">${code}</span></span>`;
  }).join('\n');
}
