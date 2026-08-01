import type { InspectorState } from './types';

const stateByShell = new WeakMap<HTMLElement, InspectorState>();

export function getState(shell: HTMLElement): InspectorState {
  const current = stateByShell.get(shell);
  if (current) return current;
  const state: InspectorState = {
    rawLog: '',
    query: '',
    wrapLines: true,
    failuresOnly: false,
    selectedFailure: 0,
    signature: '',
  };
  stateByShell.set(shell, state);
  return state;
}
