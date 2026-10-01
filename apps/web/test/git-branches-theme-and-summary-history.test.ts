import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { test } from 'vitest';

test('a página Vue de branches usa os tokens dos temas claro e escuro', async () => {
  const css = await readFile(
    path.resolve(process.cwd(), 'src/components/ProjectGitBranchesPage.css'),
    'utf8',
  );

  assert.match(css, /background:\s*var\(--surface-1\)/);
  assert.match(css, /background:\s*var\(--surface-2\)/);
  assert.match(css, /color:\s*var\(--text\)/);
  assert.match(css, /branch-state\.is-remote[\s\S]*var\(--accent\)/);
  assert.match(css, /branch-delete-form[\s\S]*var\(--danger-surface\)/);
});

test('os modais de CRUD preservam foco e respeitam o estado de Git', async () => {
  const [panelTemplate, branchesComponent, branchesTemplate] =
    await Promise.all([
      readFile(
        path.resolve(
          process.cwd(),
          'src/components/ProjectGitPanel.template.html',
        ),
        'utf8',
      ),
      readFile(
        path.resolve(
          process.cwd(),
          'src/components/ProjectGitBranchesPage.vue',
        ),
        'utf8',
      ),
      readFile(
        path.resolve(
          process.cwd(),
          'src/components/ProjectGitBranchesPage.template.html',
        ),
        'utf8',
      ),
    ]);

  assert.match(panelTemplate, /:busy="mutationRunning"/);
  assert.match(panelTemplate, /:remote-refreshing="remoteRefreshRunning"/);
  assert.match(panelTemplate, /:operation="branchOperation"/);
  assert.match(
    branchesComponent,
    /const actionsBusy = computed\(\(\) => props\.busy \|\| props\.remoteRefreshing\);/,
  );
  assert.match(branchesTemplate, /:auto-focus="false"/);
  assert.match(branchesTemplate, /:trap-focus="false"/);
  assert.match(
    branchesTemplate,
    /aria-label="Nome da branch"[\s\S]*data-branch-modal-autofocus/,
  );
  assert.match(
    branchesTemplate,
    /:disabled="actionsBusy \|\| !canSubmitDelete"/,
  );
  assert.doesNotMatch(branchesTemplate, /Mensagem do commit final|Squash/);
});
