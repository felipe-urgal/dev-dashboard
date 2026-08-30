import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import { mount } from '@vue/test-utils';

import DatabaseExplorerSidebar from '../src/components/database/DatabaseExplorerSidebar.vue';
import DatabaseQueryEditor from '../src/components/database/DatabaseQueryEditor.vue';
import DatabaseResultTable from '../src/components/database/DatabaseResultTable.vue';

const queryHistoryItem = {
  id: 'query-1',
  query: 'SELECT * FROM users',
  driver: 'postgresql' as const,
  database: 'app',
  table: 'users',
  createdAt: '2026-08-30T10:00:00.000Z',
  favorite: false,
};

describe('DatabaseExplorerSidebar', () => {
  test('emite seleção, busca e paginação sem assumir operações assíncronas', async () => {
    const wrapper = mount(DatabaseExplorerSidebar, {
      props: {
        databases: [{ name: 'app' }],
        tables: [{ schema: 'public', name: 'users' }],
        selectedDatabase: 'app',
        selectedTable: '',
        tableSearch: '',
        filteredTableCount: 1,
        page: 1,
        pageCount: 2,
        loading: false,
      },
    });

    await wrapper.get('select').setValue('app');
    await wrapper.get('input[type="search"]').setValue('user');
    await wrapper
      .get('.database-explorer-table-list > button')
      .trigger('click');
    const paginationButtons = wrapper.findAll(
      '.database-explorer-pagination button',
    );
    await paginationButtons[1]!.trigger('click');

    assert.deepEqual(wrapper.emitted('select-database')?.[0], ['app']);
    assert.deepEqual(wrapper.emitted('search-table')?.[0], ['user']);
    assert.deepEqual(wrapper.emitted('select-table')?.[0], [
      { schema: 'public', name: 'users' },
    ]);
    assert.equal(wrapper.emitted('next-page')?.length, 1);
  });
});

describe('DatabaseResultTable', () => {
  test('mantém busca, ordenação, cópia e exportação como eventos de UI', async () => {
    const wrapper = mount(DatabaseResultTable, {
      props: {
        table: 'users',
        result: {
          columns: ['id', 'name'],
          rows: [[1, 'Ana']],
          rowCount: 1,
          truncated: false,
        },
        visibleRows: [[1, 'Ana']],
        durationMs: 18,
        search: '',
        sort: null,
        copiedMessage: '',
      },
    });

    await wrapper.get('input[type="search"]').setValue('Ana');
    await wrapper.get('th button').trigger('click');
    const toolButtons = wrapper.findAll(
      '.database-explorer-result-tools button',
    );
    await toolButtons[0]!.trigger('click');
    await toolButtons[1]!.trigger('click');
    await toolButtons[2]!.trigger('click');

    assert.deepEqual(wrapper.emitted('update:search')?.[0], ['Ana']);
    assert.deepEqual(wrapper.emitted('toggle-sort')?.[0], ['id']);
    assert.equal(wrapper.emitted('copy')?.length, 1);
    assert.deepEqual(wrapper.emitted('export')?.[0], ['csv']);
    assert.deepEqual(wrapper.emitted('export')?.[1], ['json']);
    assert.match(wrapper.text(), /1 de 1 linhas · 18 ms/);
  });
});

describe('DatabaseQueryEditor', () => {
  test('preserva atalhos e ações do histórico via eventos', async () => {
    const wrapper = mount(DatabaseQueryEditor, {
      props: {
        query: 'SELECT * FROM users',
        loading: false,
        historyOpen: true,
        historyCount: 1,
        recentQueries: [queryHistoryItem],
      },
    });

    const textarea = wrapper.get('textarea');
    await textarea.setValue('SELECT id FROM users');
    await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true });
    await wrapper.get('.database-explorer-history-query').trigger('click');
    await wrapper
      .get('button[aria-label="Favoritar consulta"]')
      .trigger('click');
    await wrapper
      .get('button[aria-label="Remover consulta do histórico"]')
      .trigger('click');

    assert.deepEqual(wrapper.emitted('update:query')?.[0], [
      'SELECT id FROM users',
    ]);
    assert.equal(wrapper.emitted('run')?.length, 1);
    assert.deepEqual(wrapper.emitted('restore-query')?.[0], [queryHistoryItem]);
    assert.deepEqual(wrapper.emitted('toggle-favorite')?.[0], ['query-1']);
    assert.deepEqual(wrapper.emitted('remove-history')?.[0], ['query-1']);
  });
});
