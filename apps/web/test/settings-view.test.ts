import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettingsView from '../src/views/SettingsView.vue';

let originalFetch: typeof fetch;
afterEach(() => { if (originalFetch) globalThis.fetch = originalFetch; });

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
  assert.match(wrapper.text(), /Entre 1 e 365 dias/);
  assert.equal(wrapper.get('.settings-save-button').attributes('disabled'), '');
  await wrapper.get('input').setValue(8);
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
