import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectLogsPolling } from '../src/composables/useProjectLogsPolling';
import { makeProject } from './support/activity-fixtures.js';

const clearProjectProcessLog = vi.hoisted(() => vi.fn());
const fetchProjectProcessLog = vi.hoisted(() => vi.fn());
const followProjectProcessLogEvents = vi.hoisted(() => vi.fn());

vi.mock('../src/api', () => ({
  clearProjectProcessLog,
  fetchProjectProcessLog,
  followProjectProcessLogEvents,
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function mountHarness() {
  const project = makeProject();
  const hasManagedProcess = ref(true);
  const supportsServer = ref(true);
  const logContainer = ref<HTMLElement | null>(null);
  let state!: ReturnType<typeof useProjectLogsPolling>;

  const wrapper = mount(
    defineComponent({
      setup() {
        state = useProjectLogsPolling(
          () => project,
          hasManagedProcess,
          supportsServer,
          logContainer,
        );
        return {};
      },
      template: '<div />',
    }),
  );

  return { wrapper, state, hasManagedProcess };
}

describe('lifecycle do stream de logs do projeto', () => {
  beforeEach(() => {
    clearProjectProcessLog.mockReset();
    fetchProjectProcessLog.mockReset();
    followProjectProcessLogEvents.mockReset();
  });

  it('encerra o loading ao pausar antes do primeiro evento', async () => {
    const done = deferred<void>();
    const close = vi.fn(() => done.resolve());
    followProjectProcessLogEvents.mockReturnValue({
      close,
      done: done.promise,
    });

    const { wrapper, state } = mountHarness();
    await flushPromises();

    expect(state.loadingLogs.value).toBe(true);
    state.toggleStream();
    await flushPromises();

    expect(state.streamPaused.value).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(state.loadingLogs.value).toBe(false);
    expect(state.logErrorMessage.value).toBe('');

    wrapper.unmount();
  });

  it('encerra o loading quando o processo deixa de estar disponível', async () => {
    const done = deferred<void>();
    const close = vi.fn(() => done.resolve());
    followProjectProcessLogEvents.mockReturnValue({
      close,
      done: done.promise,
    });

    const { wrapper, state, hasManagedProcess } = mountHarness();
    await flushPromises();

    expect(state.loadingLogs.value).toBe(true);
    hasManagedProcess.value = false;
    await flushPromises();

    expect(close).toHaveBeenCalledTimes(1);
    expect(state.loadingLogs.value).toBe(false);
    expect(state.logErrorMessage.value).toBe('');

    wrapper.unmount();
  });

  it('continua expondo falha real do stream atual', async () => {
    const done = deferred<void>();
    followProjectProcessLogEvents.mockReturnValue({
      close: vi.fn(),
      done: done.promise,
    });

    const { wrapper, state } = mountHarness();
    await flushPromises();

    done.reject(new Error('stream indisponível'));
    await flushPromises();

    expect(state.logErrorMessage.value).toBe('stream indisponível');
    expect(state.loadingLogs.value).toBe(false);

    wrapper.unmount();
  });
});
