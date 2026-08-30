import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import { mount } from '@vue/test-utils';

import DatabaseConnectionDialog from '../src/components/database/DatabaseConnectionDialog.vue';
import DatabaseServicesPanel from '../src/components/database/DatabaseServicesPanel.vue';

const installedService = {
  id: 'postgresql',
  driver: 'postgresql' as const,
  label: 'PostgreSQL',
  unit: 'postgresql.service',
  installed: true,
  active: false,
};

const availableService = {
  id: 'mysql',
  driver: 'mysql' as const,
  label: 'MySQL',
  unit: 'mysql.service',
  installed: false,
  active: false,
};

describe('DatabaseServicesPanel', () => {
  test('renderiza estado dos serviços e emite apenas intenções de UI', async () => {
    const wrapper = mount(DatabaseServicesPanel, {
      props: {
        services: [installedService, availableService],
        loading: false,
        errorMessage: '',
        successMessage: '',
        lastUpdatedAt: null,
        expandedServiceId: null,
        details: {},
        detailsErrors: {},
        detailsLoading: null,
        pending: null,
      },
    });

    assert.match(wrapper.text(), /Instalados\s+1/);
    assert.match(wrapper.text(), /Disponíveis\s+1/);

    await wrapper.get('.database-machine-refresh').trigger('click');
    await wrapper
      .get('[data-service-id="postgresql"] .database-machine-actions button')
      .trigger('click');
    await wrapper
      .get('[data-service-id="postgresql"] .database-machine-details-toggle')
      .trigger('click');
    await wrapper
      .get('[data-service-id="mysql"] .database-machine-actions button')
      .trigger('click');

    assert.equal(wrapper.emitted('refresh')?.length, 1);
    assert.deepEqual(wrapper.emitted('run-action')?.[0], [
      installedService,
      'start',
    ]);
    assert.deepEqual(wrapper.emitted('toggle-details')?.[0], ['postgresql']);
    assert.deepEqual(wrapper.emitted('install')?.[0], [availableService]);
  });
});

describe('DatabaseConnectionDialog', () => {
  test('mantém edição e ações como eventos para a view', async () => {
    const wrapper = mount(DatabaseConnectionDialog, {
      props: {
        open: true,
        draft: {
          driver: 'postgresql',
          host: '127.0.0.1',
          port: 5432,
        },
        savedConnections: [
          {
            id: 'postgresql|127.0.0.1|5432|felipe|app',
            label: 'postgresql · 127.0.0.1:5432 · felipe',
            driver: 'postgresql',
            host: '127.0.0.1',
            port: 5432,
            username: 'felipe',
            database: 'app',
          },
        ],
        selectedSavedConnectionId: '',
        loading: false,
        error: '',
        testMessage: '',
      },
    });

    const selects = wrapper.findAll('select');
    await selects[0]!.setValue('postgresql|127.0.0.1|5432|felipe|app');
    await selects[1]!.setValue('mysql');
    await wrapper.get('input[autocomplete="off"]').setValue('localhost');

    const actionButtons = wrapper.findAll('.database-modal-actions button');
    await actionButtons[1]!.trigger('click');
    await actionButtons[2]!.trigger('click');
    await actionButtons[3]!.trigger('click');
    await actionButtons[0]!.trigger('click');

    assert.deepEqual(wrapper.emitted('select-saved')?.[0], [
      'postgresql|127.0.0.1|5432|felipe|app',
    ]);
    assert.deepEqual(wrapper.emitted('update-driver')?.[0], ['mysql']);
    assert.deepEqual(wrapper.emitted('update:draft')?.[0], [
      {
        driver: 'postgresql',
        host: 'localhost',
        port: 5432,
      },
    ]);
    assert.equal(wrapper.emitted('save')?.length, 1);
    assert.equal(wrapper.emitted('test')?.length, 1);
    assert.equal(wrapper.emitted('connect')?.length, 1);
    assert.equal(wrapper.emitted('close')?.length, 1);
  });
});
