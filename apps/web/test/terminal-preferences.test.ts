import { describe, expect, it } from 'vitest';

import {
  clampTerminalFontSize,
  readTerminalFontSize,
  storeTerminalFontSize,
} from '../src/utils/terminal-preferences';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe('preferências do terminal', () => {
  it('limita o tamanho da fonte ao intervalo suportado', () => {
    expect(clampTerminalFontSize(5)).toBe(11);
    expect(clampTerminalFontSize(40)).toBe(20);
    expect(clampTerminalFontSize(14.4)).toBe(14);
    expect(clampTerminalFontSize(Number.NaN)).toBe(13);
  });

  it('salva e lê o tamanho, caindo no padrão quando não há valor válido', () => {
    const storage = memoryStorage();
    expect(readTerminalFontSize(storage)).toBe(13);

    storeTerminalFontSize(16, storage);
    expect(readTerminalFontSize(storage)).toBe(16);

    expect(readTerminalFontSize(memoryStorage({ k: 'x' }))).toBe(13);
    expect(
      readTerminalFontSize({
        getItem: () => {
          throw new Error('bloqueado');
        },
      } as never),
    ).toBe(13);
  });
});
