/**
 * Limites de memória visual dos terminais do dashboard.
 *
 * A saída completa continua disponível no processo/log persistido quando o
 * fluxo oferece essa capacidade; o navegador mantém somente uma janela
 * recente para não crescer indefinidamente durante comandos longos.
 */
export const MAX_TERMINAL_SCROLLBACK_LINES = 2_000;
export const MAX_TERMINAL_RENDERED_BYTES = 262_144;
