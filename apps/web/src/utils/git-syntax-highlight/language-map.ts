import type { GitSyntaxLanguage } from './types';

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
