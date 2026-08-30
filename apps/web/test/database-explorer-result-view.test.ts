import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import { useDatabaseResultView } from '../src/composables/useDatabaseResultView';
import { useDatabaseTableListView } from '../src/composables/useDatabaseTableListView';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDatabaseResultView', () => {
  it('filtra e ordena sem mutar as linhas originais', () => {
    const view = useDatabaseResultView();
    const rows = [
      [2, 'Bia'],
      [1, 'Ana'],
      [null, 'Caio'],
    ];
    view.setResult({
      columns: ['id', 'name'],
      rows,
      rowCount: 3,
      truncated: false,
    });

    view.search.value = 'a';
    expect(view.visibleRows.value).toEqual([
      [1, 'Ana'],
      [null, 'Caio'],
    ]);

    view.search.value = '';
    view.toggleSort('id');
    expect(view.visibleRows.value).toEqual([
      [null, 'Caio'],
      [1, 'Ana'],
      [2, 'Bia'],
    ]);
    view.toggleSort('id');
    expect(view.visibleRows.value).toEqual([
      [2, 'Bia'],
      [1, 'Ana'],
      [null, 'Caio'],
    ]);
    expect(rows).toEqual([
      [2, 'Bia'],
      [1, 'Ana'],
      [null, 'Caio'],
    ]);
  });

  it('preserva o resultado ao resetar apresentação e limpa tudo explicitamente', () => {
    const view = useDatabaseResultView();
    view.setResult({
      columns: ['id'],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
    });
    view.setDuration(42);
    view.search.value = '1';
    view.toggleSort('id');
    view.copiedMessage.value = 'Resultado copiado.';

    view.resetPresentation();

    expect(view.result.value?.rowCount).toBe(1);
    expect(view.durationMs.value).toBe(42);
    expect(view.search.value).toBe('');
    expect(view.sort.value).toBeNull();
    expect(view.copiedMessage.value).toBe('');

    view.clear();
    expect(view.result.value).toBeNull();
    expect(view.durationMs.value).toBeNull();
  });

  it('copia somente as linhas visíveis em TSV', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const view = useDatabaseResultView();
    view.setResult({
      columns: ['id', 'name'],
      rows: [
        [1, 'Ana'],
        [2, 'Bia'],
      ],
      rowCount: 2,
      truncated: false,
    });
    view.search.value = 'Ana';

    await view.copy();

    expect(writeText).toHaveBeenCalledWith('id\tname\n1\tAna');
    expect(view.copiedMessage.value).toBe('Resultado copiado.');
  });

  it('exporta CSV e JSON usando a visualização filtrada', () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const view = useDatabaseResultView();
    view.setResult({
      columns: ['id', 'name'],
      rows: [
        [1, 'Ana'],
        [2, 'Bia'],
      ],
      rowCount: 2,
      truncated: false,
    });
    view.search.value = 'Bia';

    view.exportResults('csv');
    view.exportResults('json');

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(anchorClick).toHaveBeenCalledTimes(2);
  });
});

describe('useDatabaseTableListView', () => {
  it('filtra por schema/nome e reinicia a página ao buscar', () => {
    const tables = ref(
      Array.from({ length: 45 }, (_, index) => ({
        schema: index < 40 ? 'public' : 'audit',
        name: `table_${index + 1}`,
      })),
    );
    const list = useDatabaseTableListView(tables, 40);

    expect(list.visible.value).toHaveLength(40);
    expect(list.pageCount.value).toBe(2);
    list.next();
    expect(list.page.value).toBe(2);
    expect(list.visible.value).toHaveLength(5);

    list.setSearch('audit.');
    expect(list.page.value).toBe(1);
    expect(list.filtered.value).toHaveLength(5);
    expect(list.visible.value.every((table) => table.schema === 'audit')).toBe(
      true,
    );
  });

  it('mantém navegação dentro dos limites e permite reset', () => {
    const tables = ref([{ schema: 'public', name: 'users' }]);
    const list = useDatabaseTableListView(tables, 1);

    list.previous();
    expect(list.page.value).toBe(1);
    list.next();
    expect(list.page.value).toBe(1);
    list.setSearch('users');
    list.reset();
    expect(list.search.value).toBe('');
    expect(list.page.value).toBe(1);
  });
});
