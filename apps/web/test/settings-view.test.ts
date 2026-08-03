import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettingsView from '../src/views/SettingsView.vue';

let originalFetch: typeof fetch;
afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

test('mantém o anúncio acessível enquanto as configurações estão pendentes', async () => {
  vi.useFakeTimers();
  originalFetch = globalThis.fetch;
  let resolveRequest!: (response: Response) => void;
  globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => {
    resolveRequest = resolve;
  })) as typeof fetch;

  const wrapper = mount(SettingsView);
  assert.equal(wrapper.get('.settings-page').attributes('aria-busy'), 'true');
  assert.match(wrapper.get('[role="status"]').text(), /Carregando configurações/);
  assert.equal(wrapper.find('.loading-skeleton-list').exists(), false);

  await vi.advanceTimersByTimeAsync(150);
  assert.equal(wrapper.findAll('.loading-skeleton-row').length, 4);

  resolveRequest(new Response(JSON.stringify({
    values: { retentionDays: 7, scriptHistoryLimit: 200, testHistoryLimit: 50 },
    limits: {
      retentionDays: { minimum: 1, maximum: 365, default: 7 },
      scriptHistoryLimit: { minimum: 10, maximum: 1000, default: 200 },
      testHistoryLimit: { minimum: 10, maximum: 500, default: 50 },
    },
    appliesAfterRestart: false,
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  await flushPromises();

  assert.equal(wrapper.get('.settings-page').attributes('aria-busy'), 'false');
  assert.equal(wrapper.find('.loading-skeleton').exists(), false);
  wrapper.unmount();
});

test('carrega limites e informa que a alteração exige reinício', async () => {
  vi.useFakeTimers();
  originalFetch = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init = {}) => {
    requests.push(init);
    return new Response(JSON.stringify({
      values: { retentionDays: 7, scriptHistoryLimit: 200, testHistoryLimit: 50 },
      limits: {
        retentionDays: { minimum: 1, maximum: 365, default: 7 },
        scriptHistoryLimit: { minimum: 10, maximum: 1000, default: 200 },
        testHistoryLimit: { minimum: 10, maximum: 500, default: 50 },
      }, appliesAfterRestart: Boolean(init.method),
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const wrapper = mount(SettingsView);
  await flushPromises();
  assert.match(wrapper.text(), /Notificações do navegador/);
  assert.match(wrapper.text(), /pelo menos 30 segundos/);
  assert.match(wrapper.text(), /Entre 1 e 365 dias/);
  assert.equal(wrapper.get('.settings-save-button').attributes('disabled'), '');
  await wrapper.get('input[type="number"]').setValue(8);
  assert.equal(wrapper.get('.settings-save-button').attributes('disabled'), undefined);
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  assert.equal(requests.at(-1)?.method, 'PUT');
  assert.match(wrapper.text(), /Reinicie a API/);
  assert.equal(wrapper.get('.settings-save-button').attributes('disabled'), '');
  await vi.advanceTimersByTimeAsync(5_000);
  assert.doesNotMatch(wrapper.text(), /Configurações salvas/);
  vi.useRealTimers();
  wrapper.unmount();
});
