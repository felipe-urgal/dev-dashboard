import { CheckCircleIcon, CommandLineIcon } from '@heroicons/vue/24/outline';

import { mountIcon } from './dom-helpers';
import { messageEditor } from './message-editor';
import type { CommitFileKind } from './types';

export function enhanceComposer(
  section: HTMLElement,
  branch: string,
  counts: Record<CommitFileKind, number>,
): void {
  const formsHost = section.querySelector<HTMLElement>('.git-commit-forms');
  const forms = Array.from(formsHost?.querySelectorAll<HTMLFormElement>(':scope > form') ?? []);
  if (!formsHost || forms.length < 2) return;

  formsHost.classList.add('git-commit-composer');
  const standardForm = forms[0]!;
  const saveForm = forms[1]!;
  standardForm.dataset.commitMode = 'staged';
  saveForm.dataset.commitMode = 'all';

  const switcher = document.createElement('div');
  switcher.className = 'git-commit-mode-switcher';
  const intro = document.createElement('div');
  intro.className = 'git-commit-composer-intro';
  mountIcon(intro, CheckCircleIcon, 'git-commit-composer-icon');
  const introCopy = document.createElement('div');
  const introTitle = document.createElement('strong');
  introTitle.textContent = 'Criar commit';
  const introText = document.createElement('span');
  introText.textContent = 'Escolha o que será incluído antes de confirmar.';
  introCopy.append(introTitle, introText);
  intro.append(introCopy);

  const tabs = document.createElement('div');
  tabs.className = 'git-commit-mode-tabs';
  const definitions: Array<[HTMLFormElement, string, string]> = [
    [standardForm, 'Commit staged', `${counts.staged} pronto(s)`],
    [saveForm, 'Salvar tudo', `${counts.modified + counts.untracked} pendente(s)`],
  ];

  const activate = (active: HTMLFormElement): void => {
    definitions.forEach(([form]) => { form.hidden = form !== active; });
    tabs.querySelectorAll('button').forEach((button, index) => {
      button.classList.toggle('active', definitions[index]?.[0] === active);
    });
  };

  definitions.forEach(([form, label, detail], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = index === 0 ? 'active' : '';
    button.innerHTML = `<strong>${label}</strong><span>${detail}</span>`;
    button.addEventListener('click', () => activate(form));
    tabs.append(button);
  });

  switcher.append(intro, tabs);
  formsHost.prepend(switcher);
  activate(standardForm);

  messageEditor(standardForm, branch);
  messageEditor(saveForm, branch);

  const warning = document.createElement('p');
  warning.className = 'git-commit-staged-warning';
  const checkbox = standardForm.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const updateWarning = (): void => {
    const includeTracked = checkbox?.checked ?? false;
    warning.hidden = counts.staged > 0 || includeTracked;
    warning.textContent = 'Nenhum arquivo está staged. Marque “Incluir alterações rastreadas” ou use “Salvar tudo”.';
  };
  checkbox?.addEventListener('change', updateWarning);
  standardForm.querySelector('button[type="submit"]')?.before(warning);
  updateWarning();

  const shortcut = document.createElement('p');
  shortcut.className = 'git-commit-shortcut';
  mountIcon(shortcut, CommandLineIcon, 'git-commit-shortcut-icon');
  const shortcutText = document.createElement('span');
  shortcutText.textContent = 'Ctrl/⌘ + Enter para confirmar';
  shortcut.append(shortcutText);
  formsHost.append(shortcut);

  formsHost.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    const active = definitions.find(([form]) => !form.hidden)?.[0];
    active?.requestSubmit();
  });
}
