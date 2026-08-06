import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettingsView from '../src/views/SettingsView.vue';

let originalFetch: typeof fetch;
afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

const environmentProfilesResponse = () =>
  new Response(
    JSON.stringify({
      profiles: [],
      limits: {
        maxProfiles: 50,
        maxVariablesPerProfile: 30,
        maxNameLength: 100,
        maxValueLength: 4096,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

test('mantém o anúncio acessível enquanto as configurações estão pendentes', async () => {
  vi.useFakeTimers();
  originalFetch = globalThis.fetch;
  let resolveRequest!: (response: Response) => void;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    if (String(input).includes('/settings/environment-profiles'))
      return Promise.resolve(environmentProfilesResponse());
    return new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
  }) as typeof fetch;

  const wrapper = mount(SettingsView);
  assert.equal(wrapper.get('.settings-page').attributes('aria-busy'), 'true');
  assert.match(
    wrapper.get('[role="status"]').text(),
    /Carregando configurações/,
  );
  assert.equal(wrapper.find('.loading-skeleton-list').exists(), false);

  await vi.advanceTimersByTimeAsync(150);
  assert.equal(wrapper.findAll('.loading-skeleton-row').length, 4);

  resolveRequest(
    new Response(
      JSON.stringify({
        values: {
          retentionDays: 7,
          scriptHistoryLimit: 200,
          testHistoryLimit: 50,
        },
        limits: {
          retentionDays: { minimum: 1, maximum: 365, default: 7 },
          scriptHistoryLimit: { minimum: 10, maximum: 1000, default: 200 },
          testHistoryLimit: { minimum: 10, maximum: 500, default: 50 },
        },
        appliesAfterRestart: false,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  await flushPromises();

  assert.equal(wrapper.get('.settings-page').attributes('aria-busy'), 'false');
  assert.equal(wrapper.find('.loading-skeleton').exists(), false);
  wrapper.unmount();
});

test('carrega limites e informa que a alteração exige reinício', async () => {
  vi.useFakeTimers();
  originalFetch = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init = {}) => {
    if (String(input).includes('/settings/environment-profiles'))
      return environmentProfilesResponse();
    requests.push(init);
    return new Response(
      JSON.stringify({
        values: {
          retentionDays: 7,
          scriptHistoryLimit: 200,
          testHistoryLimit: 50,
        },
        limits: {
          retentionDays: { minimum: 1, maximum: 365, default: 7 },
          scriptHistoryLimit: { minimum: 10, maximum: 1000, default: 200 },
          testHistoryLimit: { minimum: 10, maximum: 500, default: 50 },
        },
        appliesAfterRestart: Boolean(init.method),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const wrapper = mount(SettingsView);
  await flushPromises();
  assert.match(wrapper.text(), /Notificações do navegador/);
  assert.match(wrapper.text(), /pelo menos 30 segundos/);
  assert.match(wrapper.text(), /Entre 1 e 365 dias/);
  assert.equal(wrapper.get('.settings-save-button').attributes('disabled'), '');
  await wrapper.get('input[type="number"]').setValue(8);
  assert.equal(
    wrapper.get('.settings-save-button').attributes('disabled'),
    undefined,
  );
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

test('cria um perfil de ambiente e não envia valor para variável de nome sensível', async () => {
  originalFetch = globalThis.fetch;
  const requests: { url: string; init: RequestInit }[] = [];
  const retentionResponse = () =>
    new Response(
      JSON.stringify({
        values: {
          retentionDays: 7,
          scriptHistoryLimit: 200,
          testHistoryLimit: 50,
        },
        limits: {
          retentionDays: { minimum: 1, maximum: 365, default: 7 },
          scriptHistoryLimit: { minimum: 10, maximum: 1000, default: 200 },
          testHistoryLimit: { minimum: 10, maximum: 500, default: 50 },
        },
        appliesAfterRestart: false,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes('/settings/retention')) return retentionResponse();
    if (
      url.includes('/settings/environment-profiles') &&
      init.method === 'POST'
    ) {
      return new Response(
        JSON.stringify({
          profile: {
            id: 'profile-1',
            name: 'Staging',
            variables: [{ name: 'API_SECRET_TOKEN' }],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }
    return environmentProfilesResponse();
  }) as typeof fetch;

  const wrapper = mount(SettingsView);
  await flushPromises();
  assert.match(wrapper.text(), /Nenhum perfil de ambiente cadastrado/);

  await wrapper.get('#environment-profile-name-input').setValue('Staging');
  const [nameInput, valueInput] = wrapper.findAll(
    '.environment-profile-variable-row input',
  );
  await nameInput?.setValue('API_SECRET_TOKEN');
  await valueInput?.setValue('não deveria ser salvo');
  assert.equal(valueInput?.attributes('disabled'), '');

  await wrapper.get('form.environment-profile-editor').trigger('submit');
  await flushPromises();

  const createRequest = requests.find(
    (entry) =>
      entry.url.includes('/settings/environment-profiles') &&
      entry.init.method === 'POST',
  );
  assert.ok(createRequest);
  const body = JSON.parse(createRequest.init.body as string) as {
    variables: { name: string; value?: string }[];
  };
  assert.deepEqual(body.variables, [{ name: 'API_SECRET_TOKEN' }]);
  wrapper.unmount();
});
