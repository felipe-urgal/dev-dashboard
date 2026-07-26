export const LOG_MASK = '[CONTEUDO_MASCARADO]';

export interface MaskedLogContent {
  content: string;
  masked: boolean;
  redactionCount: number;
}

const SENSITIVE_ASSIGNMENT =
  /(?<![A-Za-z0-9_])(["']?)((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|token))\1(\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi;
const BEARER_TOKEN = /\b(Bearer\s+)([^\s,"'};]+)/gi;
const CREDENTIAL_URL =
  /\b([a-z][a-z0-9+.-]*:\/\/[^\s\/:@]+:)([^\s\/@]+)(@)/gi;
const KNOWN_TOKEN =
  /\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g;

/**
 * Mascara somente padrões com contexto forte. A função opera na resposta,
 * mantendo o arquivo original disponível para diagnóstico local fora da API.
 */
export function maskSensitiveLogContent(
  input: string,
): MaskedLogContent {
  let redactionCount = 0;
  const replace = (
    value: string,
    pattern: RegExp,
    replacer: (...matches: string[]) => string,
  ): string =>
    value.replace(pattern, (...matches: string[]) => {
      if (matches[0]?.includes(LOG_MASK)) {
        return matches[0];
      }

      const replacement = replacer(...matches);

      if (replacement !== matches[0]) {
        redactionCount += 1;
      }

      return replacement;
    });

  let content = replace(
    input,
    SENSITIVE_ASSIGNMENT,
    (_match, keyQuote, key, separator, value) => {
      const valueQuote = value.startsWith('"') || value.startsWith("'")
        ? value[0]
        : '';

      return `${keyQuote}${key}${keyQuote}${separator}${valueQuote}${LOG_MASK}${valueQuote}`;
    },
  );
  content = replace(
    content,
    BEARER_TOKEN,
    (_match, prefix) => `${prefix}${LOG_MASK}`,
  );
  content = replace(
    content,
    CREDENTIAL_URL,
    (_match, prefix, _password, suffix) =>
      `${prefix}${LOG_MASK}${suffix}`,
  );
  content = replace(content, KNOWN_TOKEN, () => LOG_MASK);

  return {
    content,
    masked: redactionCount > 0,
    redactionCount,
  };
}
