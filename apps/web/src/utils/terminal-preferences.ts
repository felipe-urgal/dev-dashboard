const STORAGE_KEY = 'dev-dashboard:terminal-font-size';

export const TERMINAL_FONT_SIZE = { min: 11, max: 20, default: 13 } as const;

export function clampTerminalFontSize(size: number): number {
  if (!Number.isFinite(size)) return TERMINAL_FONT_SIZE.default;
  return Math.min(
    TERMINAL_FONT_SIZE.max,
    Math.max(TERMINAL_FONT_SIZE.min, Math.round(size)),
  );
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Tamanho salvo da fonte; qualquer falha de leitura cai no padrão. */
export function readTerminalFontSize(
  storage: StorageLike | undefined = defaultStorage(),
): number {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw === null || raw === undefined
      ? TERMINAL_FONT_SIZE.default
      : clampTerminalFontSize(Number(raw));
  } catch {
    return TERMINAL_FONT_SIZE.default;
  }
}

export function storeTerminalFontSize(
  size: number,
  storage: StorageLike | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, String(clampTerminalFontSize(size)));
  } catch {
    // Preferência opcional: sem armazenamento, vale só para esta sessão.
  }
}
