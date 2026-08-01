export const HUNK_PATTERN = /^(@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@)(?:\s+(.*))?$/;

export const WORD_PATTERN = /\s+|[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]/gu;
/** Acima disso a tabela de LCS deixa de valer o custo para uma linha só. */
export const WORD_DIFF_MAX_CELLS = 40_000;
/** Abaixo disso as linhas são diferentes demais: marcar tudo vira ruído. */
export const WORD_DIFF_MIN_SIMILARITY = 0.45;
