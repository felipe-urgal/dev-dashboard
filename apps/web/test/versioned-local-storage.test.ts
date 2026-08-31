import { describe, expect, it, vi } from 'vitest';

import { createVersionedLocalStorage } from '../src/utils/versioned-local-storage';

function stringList(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    return null;
  }
  return value;
}

describe('createVersionedLocalStorage', () => {
  it('migra payload legado sem versão e persiste o envelope atual', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify(['legacy'])),
      setItem: vi.fn(),
    };
    const state = createVersionedLocalStorage<string[]>({
      key: 'test.storage',
      version: 1,
      fallback: () => [],
      sanitize: stringList,
      migrate: (value, fromVersion) => {
        expect(fromVersion).toBe(0);
        return value;
      },
      storage,
    });

    expect(state.read()).toEqual(['legacy']);
    expect(storage.setItem).toHaveBeenCalledWith(
      'test.storage',
      JSON.stringify({ version: 1, value: ['legacy'] }),
    );
  });

  it('lê envelope da versão atual sem regravar', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ version: 1, value: ['current'] })),
      setItem: vi.fn(),
    };
    const state = createVersionedLocalStorage<string[]>({
      key: 'test.storage',
      version: 1,
      fallback: () => [],
      sanitize: stringList,
      storage,
    });

    expect(state.read()).toEqual(['current']);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('usa fallback para JSON inválido, payload incompatível e versão futura', () => {
    const storage = {
      getItem: vi.fn<() => string | null>(),
      setItem: vi.fn(),
    };
    const state = createVersionedLocalStorage<string[]>({
      key: 'test.storage',
      version: 1,
      fallback: () => ['fallback'],
      sanitize: stringList,
      migrate: (value) => value,
      storage,
    });

    storage.getItem.mockReturnValueOnce('{invalid');
    expect(state.read()).toEqual(['fallback']);

    storage.getItem.mockReturnValueOnce(
      JSON.stringify({ version: 1, value: [1, 2, 3] }),
    );
    expect(state.read()).toEqual(['fallback']);

    storage.getItem.mockReturnValueOnce(
      JSON.stringify({ version: 2, value: ['future'] }),
    );
    expect(state.read()).toEqual(['fallback']);
  });

  it('não derruba a feature quando o navegador bloqueia leitura ou escrita', () => {
    const blockedRead = createVersionedLocalStorage<string[]>({
      key: 'test.read',
      version: 1,
      fallback: () => ['fallback'],
      sanitize: stringList,
      storage: {
        getItem: () => {
          throw new DOMException('bloqueado', 'SecurityError');
        },
        setItem: vi.fn(),
      },
    });
    expect(blockedRead.read()).toEqual(['fallback']);

    const blockedWrite = createVersionedLocalStorage<string[]>({
      key: 'test.write',
      version: 1,
      fallback: () => [],
      sanitize: stringList,
      storage: {
        getItem: vi.fn(() => null),
        setItem: () => {
          throw new DOMException('sem espaço', 'QuotaExceededError');
        },
      },
    });
    expect(blockedWrite.write(['value'])).toBe(false);
  });
});
