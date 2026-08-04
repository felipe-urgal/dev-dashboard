import type * as Monaco from 'monaco-editor';

const HAML_LANGUAGE_ID = 'haml';

const HAML_KEYWORDS = [
  'do', 'end', 'if', 'unless', 'else', 'elsif', 'each', 'for', 'while',
  'case', 'when', 'in', 'true', 'false', 'nil', 'and', 'or', 'not',
  'yield', 'return', 'class', 'def', 'module',
];

/**
 * Monaco não distribui um tokenizer para Haml. Esta é uma gramática Monarch
 * compacta e deliberadamente simples: reconhece a marcação de tag (`%div`),
 * atalhos de classe/id (`.foo`, `#bar`), linhas de Ruby silencioso/saída
 * (`-`/`=`), comentários silenciosos (`-#`) e HTML (`/`), interpolação
 * (`#{...}`), strings, símbolos e palavras-chave — o suficiente para uma
 * coloração razoável, sem tentar ser um parser Haml completo.
 */
const HAML_TOKENIZER: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.haml',
  keywords: HAML_KEYWORDS,
  tokenizer: {
    root: [
      [/^\s*-#.*/, 'comment'],
      [/^\s*\/.*/, 'comment'],
      [/%[\w-]+/, 'tag'],
      [/[.#][\w-]+/, 'attribute.name'],
      [/[-=](?=\s|$)/, 'keyword.operator'],
      [/#\{/, { token: 'delimiter.bracket', next: '@interpolation' }],
      [/:[a-zA-Z_]\w*/, 'constant.other.symbol'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/'([^'\\]|\\.)*'/, 'string'],
      [/\b\d+(\.\d+)?\b/, 'number'],
      [/\b(?:do|end|if|unless|else|elsif|each|for|while|case|when|in|true|false|nil|and|or|not|yield|return|class|def|module)\b/, 'keyword'],
      [/[A-Z]\w*/, 'type.identifier'],
      [/[a-zA-Z_]\w*/, 'identifier'],
      [/[{}()[\],.]/, 'delimiter'],
      [/./, ''],
    ],
    interpolation: [
      [/[^}]+/, 'identifier'],
      [/\}/, { token: 'delimiter.bracket', next: '@pop' }],
    ],
  },
};

export function registerEmbeddedEditorCustomLanguages(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some((language) => language.id === HAML_LANGUAGE_ID)) {
    return;
  }
  monaco.languages.register({ id: HAML_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(HAML_LANGUAGE_ID, HAML_TOKENIZER);
}
