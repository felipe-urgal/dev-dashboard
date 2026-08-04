import type * as Monaco from 'monaco-editor';

export type EmbeddedEditorThemePreference = 'auto' | 'monokai';

export const EMBEDDED_EDITOR_THEME_OPTIONS: ReadonlyArray<{
  value: EmbeddedEditorThemePreference;
  label: string;
}> = [
  { value: 'auto', label: 'Padrão (segue o tema do dashboard)' },
  { value: 'monokai', label: 'Monokai' },
];

const MONOKAI_THEME_DATA: Monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'f8f8f2', background: '272822' },
    { token: 'invalid', foreground: 'f8f8f0' },
    { token: 'emphasis', fontStyle: 'italic' },
    { token: 'strong', fontStyle: 'bold' },
    { token: 'variable', foreground: 'f8f8f2' },
    { token: 'variable.predefined', foreground: 'f8f8f2' },
    { token: 'constant', foreground: 'ae81ff' },
    { token: 'comment', foreground: '75715e' },
    { token: 'number', foreground: 'ae81ff' },
    { token: 'number.hex', foreground: 'ae81ff' },
    { token: 'regexp', foreground: 'e6db74' },
    { token: 'annotation', foreground: '75715e' },
    { token: 'type', foreground: '66d9ef', fontStyle: 'italic' },
    { token: 'delimiter', foreground: 'f8f8f2' },
    { token: 'delimiter.html', foreground: 'f8f8f2' },
    { token: 'tag', foreground: 'f92672' },
    { token: 'metatag', foreground: '66d9ef' },
    { token: 'metatag.content.html', foreground: 'e6db74' },
    { token: 'metatag.html', foreground: 'f8f8f2' },
    { token: 'key', foreground: '66d9ef' },
    { token: 'string.key.json', foreground: 'f92672' },
    { token: 'string.value.json', foreground: 'e6db74' },
    { token: 'attribute.name', foreground: 'a6e22e' },
    { token: 'attribute.value', foreground: 'e6db74' },
    { token: 'attribute.value.number', foreground: 'ae81ff' },
    { token: 'attribute.value.unit', foreground: 'ae81ff' },
    { token: 'attribute.value.html', foreground: 'e6db74' },
    { token: 'string', foreground: 'e6db74' },
    { token: 'string.html', foreground: 'e6db74' },
    { token: 'string.sql', foreground: 'e6db74' },
    { token: 'string.yaml', foreground: 'e6db74' },
    { token: 'keyword', foreground: 'f92672' },
    { token: 'keyword.json', foreground: 'f92672' },
    { token: 'keyword.flow', foreground: 'f92672' },
    { token: 'operator.sql', foreground: '778899' },
    { token: 'predefined.sql', foreground: 'ff00ff' },
    { token: 'identifier.function', foreground: 'a6e22e' },
  ],
  colors: {
    'editor.foreground': '#F8F8F2',
    'editor.background': '#272822',
    'editor.selectionBackground': '#49483E',
    'editor.lineHighlightBackground': '#3E3D32',
    'editorCursor.foreground': '#F8F8F0',
    'editorWhitespace.foreground': '#3B3A32',
    'editorIndentGuide.background': '#3B3A32',
    'editorIndentGuide.activeBackground': '#9D550FB0',
    'editor.selectionHighlightBorder': '#222218',
  },
};

export function defineEmbeddedEditorCustomThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme('monokai', MONOKAI_THEME_DATA);
}
