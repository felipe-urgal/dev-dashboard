export const LOG_MASK = '[CONTEUDO_MASCARADO]';

export interface MaskedLogContent {
  content: string;
  masked: boolean;
  redactionCount: number;
}

// O nome da chave é capturado como um identificador plano com segmentos
// limitados (um único quantificador por segmento, sem ambiguidade de
// particionamento) e só depois verificado contra os sufixos sensíveis abaixo.
// A versão anterior embutia a lista de sufixos dentro do grupo repetido —
// `(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|...)` — e usava quantificadores
// ilimitados; um log de teste sem quebras de linha (ex. uma linha de progresso
// do rspec/vitest com dezenas de milhares de caracteres) fazia o motor tentar
// cada contagem possível de repetições em cada posição inicial antes de
// falhar, custando tempo quadrático e travando o event loop da API ao ler o
// log. Limitar o tamanho de cada segmento (nomes de chave reais nunca chegam
// perto disso) mantém o casamento em tempo linear mesmo em conteúdo hostil.
const SENSITIVE_KEY_SUFFIX =
  /(?:^|[_-])(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|token)$/i;
const SENSITIVE_ASSIGNMENT =
  /(?<![A-Za-z0-9_])(["']?)([A-Za-z0-9]{1,64}(?:[_-][A-Za-z0-9]{1,64}){0,8})\1(\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi;
const BEARER_TOKEN = /\b(Bearer\s+)([^\s,"'};]+)/gi;
// Esquema limitado a 20 chars (nenhum esquema real chega perto disso): sem
// limite, `[a-z0-9+.-]*` seguido do literal obrigatório "://" sofre do mesmo
// backtracking quadrático descrito acima quando "://" nunca aparece.
const CREDENTIAL_URL =
  /\b([a-z][a-z0-9+.-]{0,20}:\/\/[^\s\/:@]+:)([^\s\/@]+)(@)/gi;
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
    (match, keyQuote, key, separator, value) => {
      if (!SENSITIVE_KEY_SUFFIX.test(key)) {
        return match;
      }

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
