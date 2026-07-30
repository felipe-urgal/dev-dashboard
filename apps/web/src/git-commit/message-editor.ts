import { conventionalTypes } from './constants';
import { withCommitPrefix } from './commit-prefix';

function branchType(branch: string): string | undefined {
  const candidate = branch.split('/')[0]?.toLocaleLowerCase('pt-BR');
  if (!candidate) return undefined;
  if (candidate === 'feature') return 'feat';
  if (candidate === 'hotfix' || candidate === 'bugfix') return 'fix';
  return conventionalTypes.includes(candidate as (typeof conventionalTypes)[number])
    ? candidate
    : undefined;
}

export function messageEditor(form: HTMLFormElement, branch: string): void {
  const textarea = form.querySelector<HTMLTextAreaElement>('textarea');
  if (!textarea) return;

  const editor = document.createElement('div');
  editor.className = 'git-commit-message-tools';
  const label = document.createElement('span');
  label.textContent = 'Tipo de alteração';
  const chips = document.createElement('div');
  chips.className = 'git-commit-type-chips';
  const suggested = branchType(branch);

  conventionalTypes.forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = type;
    button.classList.toggle('suggested', type === suggested);
    button.title = type === suggested ? 'Sugerido pela branch atual' : `Usar prefixo ${type}:`;
    button.addEventListener('click', () => {
      textarea.value = withCommitPrefix(textarea.value, type);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
    chips.append(button);
  });

  const counter = document.createElement('span');
  counter.className = 'git-commit-character-counter';
  const updateCounter = (): void => {
    counter.textContent = `${textarea.value.length}/500`;
    counter.classList.toggle('warning', textarea.value.length > 72);
  };
  textarea.addEventListener('input', updateCounter);
  updateCounter();

  editor.append(label, chips, counter);
  textarea.closest('label')?.after(editor);
}
