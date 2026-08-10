import hljs from 'highlight.js/lib/core';

import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import erb from 'highlight.js/lib/languages/erb';
import go from 'highlight.js/lib/languages/go';
import haml from 'highlight.js/lib/languages/haml';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

export interface GitDiffSyntaxRange {
  start: number;
  end: number;
  className: string;
}

const LANGUAGES: Record<string, unknown> = {
  bash,
  css,
  dockerfile,
  erb,
  go,
  haml,
  ini,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  ruby,
  rust,
  scss,
  sql,
  typescript,
  xml,
  yaml,
};

let registered = false;

function ensureRegistered(): void {
  if (registered) return;
  for (const [name, definition] of Object.entries(LANGUAGES)) {
    hljs.registerLanguage(name, definition as never);
  }
  registered = true;
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  bash: 'bash',
  cjs: 'javascript',
  conf: 'ini',
  css: 'css',
  erb: 'erb',
  go: 'go',
  haml: 'haml',
  htm: 'xml',
  html: 'xml',
  ini: 'ini',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  markdown: 'markdown',
  md: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  php: 'php',
  py: 'python',
  rake: 'ruby',
  rb: 'ruby',
  rs: 'rust',
  sass: 'scss',
  scss: 'scss',
  sh: 'bash',
  sql: 'sql',
  svg: 'xml',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'xml',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
};

/** Nomes de arquivo sem extensão útil, mas com linguagem conhecida. */
const FILENAME_LANGUAGES: Record<string, string> = {
  dockerfile: 'dockerfile',
  gemfile: 'ruby',
  rakefile: 'ruby',
  '.bashrc': 'bash',
  '.zshrc': 'bash',
  '.env': 'ini',
};

/** Subconjunto usado na auto-detecção, para reduzir falso positivo. */
const AUTO_DETECTION_SUBSET = [
  'typescript',
  'javascript',
  'ruby',
  'python',
  'bash',
  'json',
  'yaml',
  'xml',
  'scss',
  'sql',
  'go',
  'java',
  'php',
  'rust',
  'markdown',
  'haml',
  'css',
];

const MIN_AUTO_DETECTION_RELEVANCE = 8;

export function languageForPath(filePath: string): string | null {
  const name =
    filePath.split('/').filter(Boolean).at(-1)?.toLocaleLowerCase('en') ?? '';
  if (!name) return null;

  const byName = FILENAME_LANGUAGES[name];
  if (byName) return byName;

  const extension = name.includes('.') ? (name.split('.').at(-1) ?? '') : '';
  return EXTENSION_LANGUAGES[extension] ?? null;
}

/**
 * Descobre a linguagem do arquivo: a extensão é a pista mais confiável e vem
 * primeiro; a auto-detecção do highlight.js só entra quando ela não diz nada.
 */
export function detectLanguage(
  filePath: string,
  sample: string,
): string | null {
  ensureRegistered();
  const byPath = languageForPath(filePath);
  if (byPath) return byPath;
  if (!sample.trim()) return null;

  const result = hljs.highlightAuto(sample, AUTO_DETECTION_SUBSET);
  // Relevância baixa costuma ser chute; sem cor é melhor que cor errada.
  if (!result.language || result.relevance < MIN_AUTO_DETECTION_RELEVANCE)
    return null;
  return result.language;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#x27': "'",
  '#39': "'",
};

function decodeEntity(entity: string): string {
  return ENTITIES[entity] ?? `&${entity};`;
}

/**
 * O highlight.js usa classes como `hljs-keyword` e combinações como
 * `hljs-title function_`. O restante do dashboard, porém, usa uma paleta
 * compartilhada com classes `git-syntax-*`. Normalizar aqui mantém o diff do
 * componente Vue com o mesmo realce usado no Histórico, Resumo e patches.
 */
function syntaxClassForHighlightClasses(value: string): string {
  const classes = new Set(value.split(/\s+/).filter(Boolean));

  if (classes.has('hljs-comment') || classes.has('hljs-quote'))
    return 'git-syntax-comment';
  if (
    classes.has('hljs-string') ||
    classes.has('hljs-regexp') ||
    classes.has('hljs-template-tag') ||
    classes.has('hljs-template-variable')
  )
    return 'git-syntax-string';
  if (classes.has('hljs-number')) return 'git-syntax-number';
  if (classes.has('hljs-literal')) return 'git-syntax-literal';
  if (
    classes.has('hljs-keyword') ||
    classes.has('hljs-doctag') ||
    classes.has('hljs-meta')
  )
    return 'git-syntax-keyword';
  if (classes.has('hljs-title') && classes.has('function_'))
    return 'git-syntax-function';
  if (classes.has('hljs-title') && classes.has('class_'))
    return 'git-syntax-type';
  if (classes.has('hljs-title')) return 'git-syntax-function';
  if (classes.has('hljs-type') || classes.has('hljs-built_in'))
    return 'git-syntax-type';
  if (
    classes.has('hljs-attr') ||
    classes.has('hljs-attribute') ||
    classes.has('hljs-property')
  )
    return 'git-syntax-property';
  if (classes.has('hljs-variable') || classes.has('hljs-params'))
    return 'git-syntax-variable';
  if (classes.has('hljs-symbol') || classes.has('hljs-bullet'))
    return 'git-syntax-symbol';
  if (classes.has('hljs-operator')) return 'git-syntax-operator';
  if (classes.has('hljs-tag') || classes.has('hljs-name'))
    return 'git-syntax-tag';
  if (
    classes.has('hljs-selector-class') ||
    classes.has('hljs-selector-id') ||
    classes.has('hljs-selector-pseudo') ||
    classes.has('hljs-selector-attr')
  )
    return 'git-syntax-selector';

  return '';
}

/**
 * Converte a saída HTML do highlight.js em faixas sobre o texto puro.
 *
 * Trabalhar com faixas — em vez de injetar o HTML pronto — é o que permite
 * combinar o realce de sintaxe com o destaque do trecho alterado e com as
 * ocorrências da busca na mesma linha.
 */
export function syntaxRangesFromHighlightedHtml(
  html: string,
  expectedText: string,
): GitDiffSyntaxRange[] {
  const ranges: GitDiffSyntaxRange[] = [];
  const stack: string[] = [];
  let plain = '';
  let cursor = 0;

  const pattern =
    /<span class="([^"]*)">|<\/span>|&([a-z#0-9]+);|[^<&]+|[<&]/gi;
  let match = pattern.exec(html);
  while (match) {
    const [token, openClass, entity] = match;

    if (openClass !== undefined) {
      const inherited = [...stack].reverse().find(Boolean) ?? '';
      stack.push(syntaxClassForHighlightClasses(openClass) || inherited);
    } else if (token === '</span>') {
      stack.pop();
    } else {
      const text = entity !== undefined ? decodeEntity(entity) : token;
      plain += text;
      const className = [...stack].reverse().find(Boolean);
      if (className) {
        const last = ranges.at(-1);
        if (last && last.end === cursor && last.className === className)
          last.end = cursor + text.length;
        else
          ranges.push({ start: cursor, end: cursor + text.length, className });
      }
      cursor += text.length;
    }

    match = pattern.exec(html);
  }

  // Qualquer divergência significa que o parser não acompanhou a saída: é
  // preferível ficar sem realce a desalinhar as faixas com o texto.
  return plain === expectedText ? ranges : [];
}

export function syntaxRangesFor(
  text: string,
  language: string | null,
): GitDiffSyntaxRange[] {
  if (!language || !text) return [];
  ensureRegistered();
  if (!hljs.getLanguage(language)) return [];

  try {
    const { value } = hljs.highlight(text, { language, ignoreIllegals: true });
    return syntaxRangesFromHighlightedHtml(value, text);
  } catch {
    return [];
  }
}
