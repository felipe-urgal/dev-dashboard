import { collectLog, hidden, modeFor } from './dom-helpers';
import { applyFilters, toolbarFor } from './filters';
import { renderInspector } from './inspector-render';
import { getState } from './state';

function enhanceShell(shell: HTMLElement): void {
  const state = getState(shell);
  const mode = modeFor(shell);
  const toolbar = toolbarFor(shell, state);
  const output = shell.querySelector<HTMLElement>('.tests-log-output');
  const footer = shell.querySelector<HTMLElement>('.tests-log-footer');
  const inspector = shell.querySelector<HTMLElement>(':scope > .test-log-inspector');
  if (mode === 'log') {
    const log = collectLog(shell);
    if (log) state.rawLog = log;
    hidden(toolbar, false);
    hidden(output, false);
    hidden(footer, false);
    hidden(inspector, true);
    applyFilters(shell, state);
    return;
  }
  hidden(toolbar, true);
  if (mode === 'errors' || mode === 'details') {
    if (!state.rawLog) state.rawLog = collectLog(shell);
    renderInspector(shell, state, mode);
    hidden(output, true);
    hidden(footer, true);
    hidden(shell.querySelector<HTMLElement>(':scope > .test-log-inspector'), false);
    return;
  }
  hidden(output, false);
  hidden(footer, false);
  hidden(inspector, true);
}

export function enhanceTestLogInspector(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.tests-log-shell')) enhanceShell(root);
  root.querySelectorAll<HTMLElement>('.tests-log-shell').forEach(enhanceShell);
}
