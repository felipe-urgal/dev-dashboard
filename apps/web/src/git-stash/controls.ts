import { stateBySection } from './state';

export function refreshControls(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  section.classList.toggle('is-busy', state.busy);
  section.querySelectorAll<HTMLInputElement | HTMLButtonElement>('[data-stash-control]')
    .forEach((element) => {
      const action = element.dataset.stashControl;
      if (action === 'create') {
        element.disabled = state.busy || state.changedFiles === 0;
      } else if (action === 'restore') {
        element.disabled = state.busy || state.changedFiles > 0 || !state.detail;
      } else if (action === 'drop') {
        element.disabled = state.busy || !state.detail;
      } else {
        element.disabled = state.busy;
      }
    });
}

export function renderMetrics(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  const branch = section.querySelector<HTMLElement>('[data-stash-metric="branch"] strong');
  const changes = section.querySelector<HTMLElement>('[data-stash-metric="changes"] strong');
  const saved = section.querySelector<HTMLElement>('[data-stash-metric="saved"] strong');
  if (branch) branch.textContent = state.detached ? 'HEAD destacado' : state.branch;
  if (changes) changes.textContent = String(state.changedFiles);
  if (saved) saved.textContent = String(state.stashes.length);
  const restoreHint = section.querySelector<HTMLElement>('.git-stash-restore-hint');
  if (restoreHint) {
    restoreHint.textContent = state.changedFiles > 0
      ? 'Limpe ou guarde o working tree antes de aplicar um stash.'
      : 'Working tree limpo: o stash pode ser restaurado com segurança.';
    restoreHint.classList.toggle('is-warning', state.changedFiles > 0);
  }
  refreshControls(section);
}
